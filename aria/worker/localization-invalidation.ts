import { deliverCacheInvalidationJob } from "../lib/cache/invalidationJobs";
import type { AriaCloudflareEnv } from "../lib/cloudflare/env";
import { drainLocalizationInvalidations } from "../lib/localization/invalidationDrain";
import { CloudflareStorageAdapter } from "../lib/storage/cloudflare";

/** Bounded scheduled retry for all post-commit public cache delivery. */
export async function reconcileCacheInvalidations(
  env: AriaCloudflareEnv,
): Promise<void> {
  const adapter = new CloudflareStorageAdapter({
    ...env,
  } as never);
  await drainLocalizationInvalidations({
    adapter,
    deliver: (job) =>
      deliverCacheInvalidationJob(
        { locals: { cfBindings: env } as never },
        job,
      ),
    deliveryAttempts: 3,
  });
}

export const reconcileLocalizationInvalidations = reconcileCacheInvalidations;
