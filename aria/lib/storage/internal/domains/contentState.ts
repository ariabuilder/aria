import type {
  ContentSiteState,
  StorageAdapter,
  TouchContentRevisionInput,
} from "../../adapter";
import { createTouchedContentSiteState } from "../../../content-sync/types";

export type ContentStateStorageDomain = Pick<
  StorageAdapter,
  | "touchResource"
  | "getResourceTouch"
  | "getContentSiteState"
  | "touchContentRevision"
>;

type ContentStateStorageContext = {
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
  now(): string;
  getContentSiteState(scope?: string): Promise<ContentSiteState | null>;
};

export function createContentStateStorageDomain(
  context: ContentStateStorageContext,
): ContentStateStorageDomain {
  return {
    touchResource: (resourceName, timestamp) =>
      context.run(
        `INSERT INTO aria_resource_touches (resource_name, touched_at)
         VALUES (?, ?)
         ON CONFLICT(resource_name) DO UPDATE SET
           touched_at = excluded.touched_at`,
        [resourceName, timestamp ?? context.now()],
      ),
    async getContentSiteState(
      scope = "default",
    ): Promise<ContentSiteState | null> {
      const row = await context.queryFirst<{
        scope: string;
        current_revision_id: string;
        revision_seq: number;
        content_digest: string | null;
        updated_at: string;
        updated_by: string | null;
        last_mutation_kind: string;
        last_mutation_target: string | null;
        schema_version: string | null;
      }>(
        `SELECT scope, current_revision_id, revision_seq, content_digest,
                updated_at, updated_by, last_mutation_kind,
                last_mutation_target, schema_version
         FROM aria_content_site_state WHERE scope = ? LIMIT 1`,
        [scope],
      );
      if (!row) return null;
      return {
        scope: String(row.scope),
        currentRevisionId: String(row.current_revision_id),
        revisionSeq: Number(row.revision_seq ?? 0),
        contentDigest:
          typeof row.content_digest === "string"
            ? row.content_digest
            : undefined,
        updatedAt: String(row.updated_at),
        updatedBy:
          typeof row.updated_by === "string" ? row.updated_by : undefined,
        lastMutationKind:
          row.last_mutation_kind as ContentSiteState["lastMutationKind"],
        lastMutationTarget:
          typeof row.last_mutation_target === "string"
            ? row.last_mutation_target
            : undefined,
        schemaVersion:
          typeof row.schema_version === "string"
            ? row.schema_version
            : undefined,
      };
    },
    async touchContentRevision(
      input: TouchContentRevisionInput,
    ): Promise<ContentSiteState> {
      const previousState = await context.getContentSiteState(
        input.scope ?? "default",
      );
      const nextState = createTouchedContentSiteState({
        previousState,
        mutation: input,
      });
      await context.run(
        `INSERT INTO aria_content_site_state (
           scope, current_revision_id, revision_seq, content_digest, updated_at,
           updated_by, last_mutation_kind, last_mutation_target, schema_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scope) DO UPDATE SET
           current_revision_id = excluded.current_revision_id,
           revision_seq = excluded.revision_seq,
           content_digest = excluded.content_digest,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by,
           last_mutation_kind = excluded.last_mutation_kind,
           last_mutation_target = excluded.last_mutation_target,
           schema_version = excluded.schema_version`,
        [
          nextState.scope,
          nextState.currentRevisionId,
          nextState.revisionSeq,
          nextState.contentDigest ?? null,
          nextState.updatedAt,
          nextState.updatedBy ?? null,
          nextState.lastMutationKind,
          nextState.lastMutationTarget ?? null,
          nextState.schemaVersion ?? null,
        ],
      );
      return nextState;
    },
    async getResourceTouch(resourceName: string): Promise<string | null> {
      const row = await context.queryFirst<{ touched_at: string }>(
        `SELECT touched_at FROM aria_resource_touches WHERE resource_name = ? LIMIT 1`,
        [resourceName],
      );
      return row ? String(row.touched_at) : null;
    },
  };
}
