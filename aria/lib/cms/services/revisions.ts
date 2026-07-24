import { generateId } from "../../crypto";
import { AriaEntryRecordSchema } from "../schemas";
import { cmsActorFromAuthorship } from "../authorship";
import { CmsServiceError } from "../errors";
import {
  buildEntryRevision,
  getEntryFromAdapter,
  type EntryMutationCommandOptions,
} from "./entries";
import { syncCmsEntrySearchDocuments } from "./search";
import type { AriaEntryRecord, AriaEntryRevision } from "../schemas";
import type { ActorRef } from "../../auth/types";
import type { StorageAdapter } from "../../storage/adapter";
import { normalizeEntryRecordForStorage } from "../storage/entryMutation";

function nowIso(): string {
  return new Date().toISOString();
}

export async function listRevisionsFromAdapter(
  adapter: StorageAdapter,
  input: {
    collectionId: string;
    entryId: string;
    page?: number;
    limit?: number;
  },
): Promise<{ revisions: AriaEntryRevision[]; page: number; limit: number }> {
  const current = await getEntryFromAdapter(adapter, {
    collectionId: input.collectionId,
    idOrSlug: input.entryId,
  });

  const limit = input.limit ?? 50;
  const page = input.page ?? 1;
  const offset = (page - 1) * limit;
  const revisions = await adapter.listEntryRevisions(current.entry.id, {
    limit,
    offset,
  });

  return { revisions, page, limit };
}

export async function getRevisionFromAdapter(
  adapter: StorageAdapter,
  revisionId: string,
): Promise<AriaEntryRevision> {
  const revision = await adapter.getEntryRevision(revisionId);
  if (!revision) {
    throw new CmsServiceError("NOT_FOUND", `Revision not found: ${revisionId}`);
  }
  return revision;
}

export async function restoreRevisionOnAdapter(
  adapter: StorageAdapter,
  input: {
    collectionId: string;
    entryId: string;
    revisionId: string;
    expectedVersion: string;
  },
  actor: ActorRef,
  command?: EntryMutationCommandOptions,
): Promise<AriaEntryRecord> {
  const actorDisplay = cmsActorFromAuthorship(actor);
  const current = await getEntryFromAdapter(adapter, {
    collectionId: input.collectionId,
    idOrSlug: input.entryId,
  });

  if (current.entry.version !== input.expectedVersion) {
    throw new CmsServiceError(
      "CONFLICT",
      `Entry version conflict: expected ${input.expectedVersion}, found ${current.entry.version}`,
    );
  }

  const revision = await getRevisionFromAdapter(adapter, input.revisionId);
  if (revision.entryId !== current.entry.id) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      "Revision does not belong to entry",
    );
  }

  const restored = AriaEntryRecordSchema.parse({
    entry: {
      ...revision.snapshot.entry,
      collectionId: input.collectionId,
      version: generateId(),
      authorId: actorDisplay.id,
      updatedAt: nowIso(),
    },
    locales: revision.snapshot.locales.map((locale) => ({
      ...locale,
      entryId: current.entry.id,
      collectionId: input.collectionId,
    })),
    relations: revision.snapshot.relations,
    authorship: {
      author: actorDisplay,
      createdBy:
        current.authorship?.createdBy ?? current.authorship?.author ?? null,
      updatedBy: actorDisplay,
      publishedBy:
        revision.snapshot.entry.publishedAt &&
        revision.snapshot.entry.status === "published"
          ? (current.authorship?.publishedBy ?? null)
          : null,
    },
  });

  const canonicalRestored = normalizeEntryRecordForStorage(restored);
  const api = command?.apiContext?.prepare(canonicalRestored);
  let saved: AriaEntryRecord;
  try {
    saved = command
      ? await adapter.commitCmsEntryMutation({
          record: canonicalRestored,
          expectedVersion: input.expectedVersion,
          relations: restored.relations,
          revision: buildEntryRevision(
            current,
            actor,
            "Before revision restore",
          ),
          auditEvent: command.auditEventFor(canonicalRestored),
          api,
        })
      : await adapter.saveEntry(restored, {
          expectedVersion: input.expectedVersion,
          relations: restored.relations,
        });
  } catch (error) {
    if (error instanceof Error && error.message.includes("version conflict")) {
      throw new CmsServiceError("CONFLICT", error.message);
    }
    throw error;
  }
  if (api) command?.apiContext?.markCommitted(api.response);
  await syncCmsEntrySearchDocuments(adapter, saved);
  return saved;
}
