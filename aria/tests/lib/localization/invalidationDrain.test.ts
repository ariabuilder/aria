import { describe, expect, it, vi } from "vitest";

import { drainLocalizationInvalidations } from "../../../lib/localization/invalidationDrain";
import type { CacheInvalidationJob } from "../../../lib/localization/siteTranslationSchemas";
import type { StorageAdapter } from "../../../lib/storage/adapter";

const job: CacheInvalidationJob = {
  id: "job-1",
  idempotencyKey: "localization:publish:page:about:fr:v1",
  scope: "all",
  payload: {},
  status: "processing",
  attemptCount: 1,
  nextAttemptAt: "2026-07-13T12:00:00.000Z",
  leaseToken: "worker",
  leaseExpiresAt: "2026-07-13T12:01:00.000Z",
  lastError: null,
  createdAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z",
  completedAt: null,
};

function adapterWith(jobs: CacheInvalidationJob[]): StorageAdapter {
  return {
    claimDueCacheInvalidationJobs: vi.fn(async () => jobs),
    completeCacheInvalidationJob: vi.fn(async () => undefined),
    failCacheInvalidationJob: vi.fn(async () => undefined),
  } as unknown as StorageAdapter;
}

describe("drainLocalizationInvalidations", () => {
  it("marks only acknowledged delivery as complete", async () => {
    const adapter = adapterWith([job]);
    const result = await drainLocalizationInvalidations({
      adapter,
      leaseToken: "worker",
      deliver: vi.fn(async () => undefined),
    });
    expect(result).toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
      completedJobIds: [job.id],
      failedJobIds: [],
    });
    expect(adapter.completeCacheInvalidationJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: job.id, leaseToken: "worker" }),
    );
  });

  it("keeps failed delivery retryable", async () => {
    const adapter = adapterWith([job]);
    const result = await drainLocalizationInvalidations({
      adapter,
      leaseToken: "worker",
      deliver: async () => {
        throw new Error("purge unavailable");
      },
    });
    expect(result).toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
      completedJobIds: [],
      failedJobIds: [job.id],
    });
    expect(adapter.failCacheInvalidationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        id: job.id,
        leaseToken: "worker",
        lastError: "purge unavailable",
      }),
    );
  });
});
