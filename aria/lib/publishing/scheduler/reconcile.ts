import type { RuntimeLocals } from "../../cloudflare/env";
import {
  invalidateComposeCache,
  purgePublicPageCache,
} from "../../cache/service";
import { invalidateCmsEntryPublicCache } from "../../cms/invalidateEntryCache";
import { touchContentRevisionForAction } from "../../content-sync/mutations";
import { savePageSnapshot } from "../../rendering/pageSnapshots";
import type { StorageAdapter } from "../../storage/adapter";
import { log } from "../../utils/logger";
import {
  claimDueCmsEntry,
  findDueCmsEntries,
  recoverExpiredCmsScheduleLeases,
  recordCmsScheduleFailure,
  releaseCmsScheduleLease,
} from "./cms";
import { BATCH_LIMIT, LEASE_MS, MAX_SCHEDULE_ATTEMPTS } from "./constants";
import { executeCmsEntryPublication, executePagePublication } from "./execute";
import {
  claimDuePage,
  findDuePages,
  recoverExpiredPageScheduleLeases,
  recordPageScheduleFailure,
} from "./pages";
import {
  ReconcileOptionsSchema,
  ReconcileResultSchema,
  type ReconcileOptions,
  type ReconcileResult,
  type ScheduleSqlExecutor,
} from "./schemas";

function addMilliseconds(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

async function processDueCmsEntries(
  adapter: StorageAdapter,
  sql: ScheduleSqlExecutor,
  now: string,
  batchLimit: number,
  cacheLocals?: RuntimeLocals,
): Promise<
  Pick<ReconcileResult, "cmsProcessed" | "cmsSucceeded" | "cmsFailed">
> {
  let cmsProcessed = 0;
  let cmsSucceeded = 0;
  let cmsFailed = 0;
  const due = await findDueCmsEntries(sql, now, batchLimit);

  for (const item of due) {
    const leaseToken = crypto.randomUUID();
    const leaseExpiresAt = addMilliseconds(now, LEASE_MS);
    const claimed = await claimDueCmsEntry(
      sql,
      { id: item.id, collectionId: item.collectionId },
      now,
      leaseToken,
      leaseExpiresAt,
    );
    if (!claimed) {
      continue;
    }

    cmsProcessed += 1;
    try {
      await executeCmsEntryPublication(adapter, claimed, cacheLocals);
      const released = await releaseCmsScheduleLease(
        sql,
        { id: claimed.id, collectionId: claimed.collectionId },
        leaseToken,
        now,
      );
      if (released) {
        cmsSucceeded += 1;
        if (cacheLocals) {
          await invalidateCmsEntryPublicCache(
            adapter,
            { locals: cacheLocals },
            {
              collectionId: claimed.collectionId,
              entryId: claimed.id,
            },
          );
        }
      } else {
        cmsFailed += 1;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Scheduled CMS publish failed";
      await recordCmsScheduleFailure(
        sql,
        { id: claimed.id, collectionId: claimed.collectionId },
        leaseToken,
        message,
        now,
        MAX_SCHEDULE_ATTEMPTS,
      );
      cmsFailed += 1;
    }
  }

  return { cmsProcessed, cmsSucceeded, cmsFailed };
}

async function processDuePages(
  adapter: StorageAdapter,
  sql: ScheduleSqlExecutor,
  now: string,
  batchLimit: number,
  cacheLocals?: RuntimeLocals,
): Promise<
  Pick<ReconcileResult, "pagesProcessed" | "pagesSucceeded" | "pagesFailed">
> {
  let pagesProcessed = 0;
  let pagesSucceeded = 0;
  let pagesFailed = 0;
  const due = await findDuePages(sql, now, batchLimit);

  for (const item of due) {
    const leaseToken = crypto.randomUUID();
    const leaseExpiresAt = addMilliseconds(now, LEASE_MS);
    const claimed = await claimDuePage(
      sql,
      { id: item.id },
      now,
      leaseToken,
      leaseExpiresAt,
    );
    if (!claimed) {
      continue;
    }

    pagesProcessed += 1;
    try {
      const publishedVersion = await executePagePublication(adapter, claimed);
      if (!publishedVersion) {
        throw new Error(`Unable to publish scheduled page "${claimed.id}"`);
      }
      pagesSucceeded += 1;
      if (cacheLocals) {
        const sideEffects = await Promise.allSettled([
          (async () => {
            const publishedPage = await adapter.getPublishedPageDSL(claimed.id);
            if (!publishedPage) return;
            await savePageSnapshot(
              { page: publishedPage, stage: "published" },
              adapter,
              { locals: cacheLocals },
            );
          })(),
          touchContentRevisionForAction(
            adapter,
            {
              mutationKind: "save-page",
              mutationTarget: claimed.id,
            },
            { locals: cacheLocals },
          ),
          (async () => {
            const publishedPage = await adapter.getPublishedPageDSL(claimed.id);
            const slug = publishedPage?.slug || claimed.id;
            await invalidateComposeCache(
              { locals: cacheLocals },
              "page",
              slug,
              publishedVersion,
              "publishing",
            );
            await purgePublicPageCache(
              { locals: cacheLocals },
              { id: claimed.id, slug },
            );
          })(),
        ]);
        sideEffects.forEach((result, index) => {
          if (result.status === "rejected") {
            log("warn", "Scheduled page publish side effect failed", {
              pageId: claimed.id,
              index,
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            });
          }
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Scheduled page publish failed";
      await recordPageScheduleFailure(
        sql,
        { id: claimed.id },
        leaseToken,
        message,
        now,
        MAX_SCHEDULE_ATTEMPTS,
      );
      pagesFailed += 1;
    }
  }

  return { pagesProcessed, pagesSucceeded, pagesFailed };
}

export async function reconcileScheduledPublications(
  adapter: StorageAdapter,
  sql: ScheduleSqlExecutor,
  options?: ReconcileOptions & { cacheLocals?: RuntimeLocals },
): Promise<ReconcileResult> {
  // cacheLocals is runtime-only context, not part of the public reconciliation
  // options schema. Validate only the serializable scheduler options so the
  // strict schema does not reject Cloudflare's cache invalidation context.
  const parsed = ReconcileOptionsSchema.parse({
    now: options?.now,
    batchLimit: options?.batchLimit,
  });
  const cacheLocals = options?.cacheLocals;
  const now = parsed.now ?? new Date().toISOString();
  const batchLimit = parsed.batchLimit ?? BATCH_LIMIT;

  const recoveredCmsLeases = await recoverExpiredCmsScheduleLeases(sql, now);
  const recoveredPageLeases = await recoverExpiredPageScheduleLeases(sql, now);

  const cms = await processDueCmsEntries(
    adapter,
    sql,
    now,
    batchLimit,
    cacheLocals,
  );
  const pages = await processDuePages(
    adapter,
    sql,
    now,
    batchLimit,
    cacheLocals,
  );

  return ReconcileResultSchema.parse({
    ...cms,
    ...pages,
    recoveredCmsLeases,
    recoveredPageLeases,
  });
}
