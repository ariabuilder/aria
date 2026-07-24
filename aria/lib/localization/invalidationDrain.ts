import type { StorageAdapter } from "../storage/adapter";
import type { CacheInvalidationJob } from "./siteTranslationSchemas";

const DEFAULT_BATCH_SIZE = 25;
const LEASE_MS = 60_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

export type LocalizationInvalidationDeliverer = (
  job: CacheInvalidationJob,
) => Promise<void>;

export type LocalizationInvalidationDrainResult = {
  claimed: number;
  completed: number;
  failed: number;
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
export async function drainLocalizationInvalidations(input: {
  adapter: StorageAdapter;
  deliver: LocalizationInvalidationDeliverer;
  limit?: number;
  leaseToken?: string;
  now?: string;
}): Promise<LocalizationInvalidationDrainResult> {
  const now = input.now ?? nowIso();
  const leaseToken = input.leaseToken ?? globalThis.crypto.randomUUID();
  const jobs = await input.adapter.claimDueCacheInvalidationJobs({
    now,
    leaseToken,
    leaseExpiresAt: afterMs(LEASE_MS),
    updatedAt: now,
    limit: Math.min(Math.max(input.limit ?? DEFAULT_BATCH_SIZE, 1), 100),
  });
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await input.deliver(job);
      await input.adapter.completeCacheInvalidationJob({
        id: job.id,
        leaseToken,
        completedAt: nowIso(),
      });
      completed += 1;
    } catch (error) {
      await input.adapter.failCacheInvalidationJob({
        id: job.id,
        leaseToken,
        nextAttemptAt: afterMs(retryDelayMs(job.attemptCount)),
        updatedAt: nowIso(),
        lastError: error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000),
      });
      failed += 1;
    }
  }
  return { claimed: jobs.length, completed, failed };
}
