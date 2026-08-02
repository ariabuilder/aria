import { buildSystemAuthorshipSaveContext } from "../../authorship/stamping";
import { publishEntryOnAdapter } from "../../cms/services/entries";
import type { StorageAdapter } from "../../storage/adapter";
import { SYSTEM_SCHEDULE_ACTOR } from "./constants";
import type { ClaimedCmsEntry, ClaimedPage } from "./schemas";
import { createCmsAuditEvent } from "../../cms/services/accessPolicy";
import type { RuntimeLocals } from "../../cloudflare/env";
import { scheduleIntegrationEventWakeup } from "../../integrations/wakeup";
import { resolvePagePublicationDependencies } from "../pageDependencies";

export async function executeCmsEntryPublication(
  adapter: StorageAdapter,
  entry: Pick<
    ClaimedCmsEntry,
    "collectionId" | "id" | "version" | "currentVersion"
  >,
  locals?: RuntimeLocals,
): Promise<void> {
  if (entry.currentVersion !== entry.version) {
    throw new Error(
      `Scheduled CMS version conflict: expected ${entry.version}, found ${entry.currentVersion}`,
    );
  }
  await publishEntryOnAdapter(
    adapter,
    {
      collectionId: entry.collectionId,
      id: entry.id,
      version: entry.version,
    },
    SYSTEM_SCHEDULE_ACTOR,
    {
      eventSource: "system",
      onIntegrationEventCommitted: locals
        ? (event) => scheduleIntegrationEventWakeup(locals, event)
        : undefined,
      auditEventFor: (published) =>
        createCmsAuditEvent({
          action: "entry.publish",
          actorId: SYSTEM_SCHEDULE_ACTOR.id,
          actorUsername: SYSTEM_SCHEDULE_ACTOR.username,
          collectionId: published.entry.collectionId,
          entryId: published.entry.id,
          summary: "Published scheduled CMS entry",
          metadata: { scheduled: true },
        }),
    },
  );
}

export async function executePagePublication(
  adapter: StorageAdapter,
  page: Pick<
    ClaimedPage,
    "id" | "version" | "currentVersion" | "scheduleLeaseToken"
  >,
): Promise<string | null> {
  if (page.currentVersion !== page.version) {
    throw new Error(
      `Scheduled page version conflict: expected ${page.version}, found ${page.currentVersion}`,
    );
  }
  const authorship = buildSystemAuthorshipSaveContext("save-page");
  const savedPage = await adapter.getPageDSL(page.id, page.version);
  if (!savedPage) {
    throw new Error(`Scheduled page revision not found: ${page.id}`);
  }
  return adapter.publishPageDSL(page.id, authorship, {
    expectedVersion: page.version,
    scheduleLeaseToken: page.scheduleLeaseToken,
    dependencies: await resolvePagePublicationDependencies(savedPage, adapter),
  });
}
