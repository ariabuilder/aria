import type { RuntimeLocals } from "../../cloudflare/env";
import { invalidateCmsEntryPublicCache } from "../../cms/invalidateEntryCache";
import type { StorageAdapter } from "../../storage/adapter";
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
  releasePageScheduleLease,
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
      const released = await releasePageScheduleLease(
        sql,
        { id: claimed.id },
        leaseToken,
        now,
      );
      if (released) {
        pagesSucceeded += 1;
      } else {
        pagesFailed += 1;
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
  const pages = await processDuePages(adapter, sql, now, batchLimit);

  return ReconcileResultSchema.parse({
    ...cms,
    ...pages,
    recoveredCmsLeases,
    recoveredPageLeases,
  });
}
