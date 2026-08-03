import type { StorageAdapter } from "../storage/adapter";
import type { CacheInvalidationJob } from "./siteTranslationSchemas";

const DEFAULT_BATCH_SIZE = 25;
const LEASE_MS = 60_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

export type CacheInvalidationDeliverer = (
  job: CacheInvalidationJob,
) => Promise<void>;

export type CacheInvalidationDrainResult = {
  claimed: number;
  completed: number;
  failed: number;
  completedJobIds: string[];
  failedJobIds: string[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function afterMs(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function retryDelayMs(attempt: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** Math.min(attempt, 12));
}

/**
 * Claims and delivers durable cache intent. The callback is deliberately
 * external to storage: DB commits remain authoritative when an edge.
 */
export async function drainCacheInvalidations(input: {
  adapter: StorageAdapter;
  deliver: CacheInvalidationDeliverer;
  limit?: number;
  leaseToken?: string;
  now?: string;
  jobId?: string;
  deliveryAttempts?: number;
  force?: boolean;
}): Promise<CacheInvalidationDrainResult> {
  const now = input.now ?? nowIso();
  const leaseToken = input.leaseToken ?? globalThis.crypto.randomUUID();
  const jobs = await input.adapter.claimDueCacheInvalidationJobs({
    now,
    leaseToken,
    leaseExpiresAt: afterMs(LEASE_MS),
    updatedAt: now,
    limit: Math.min(Math.max(input.limit ?? DEFAULT_BATCH_SIZE, 1), 100),
    jobId: input.jobId,
    force: input.force,
  });
  let completed = 0;
  let failed = 0;
  const completedJobIds: string[] = [];
  const failedJobIds: string[] = [];
  for (const job of jobs) {
    try {
      const deliveryAttempts = Math.min(
        Math.max(input.deliveryAttempts ?? 1, 1),
        3,
      );
      let deliveryError: unknown;
      for (let attempt = 0; attempt < deliveryAttempts; attempt += 1) {
        try {
          await input.deliver(job);
          deliveryError = undefined;
          break;
        } catch (error) {
          deliveryError = error;
        }
      }
      if (deliveryError) throw deliveryError;
      await input.adapter.completeCacheInvalidationJob({
        id: job.id,
        leaseToken,
        completedAt: nowIso(),
      });
      completed += 1;
      completedJobIds.push(job.id);
    } catch (error) {
      await input.adapter.failCacheInvalidationJob({
        id: job.id,
        leaseToken,
        nextAttemptAt: afterMs(retryDelayMs(job.attemptCount)),
        updatedAt: nowIso(),
        lastError:
          error instanceof Error
            ? error.message.slice(0, 2_000)
            : String(error).slice(0, 2_000),
      });
      failed += 1;
      failedJobIds.push(job.id);
    }
  }
  return {
    claimed: jobs.length,
    completed,
    failed,
    completedJobIds,
    failedJobIds,
  };
}

/** Compatibility alias for callers created before publication jobs shared the drain. */
export const drainLocalizationInvalidations = drainCacheInvalidations;
