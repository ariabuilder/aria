import {
  getPublicLayoutCacheTag,
  getPublicPageCacheTags,
  purgePublicCacheTags,
} from "../lib/cache/service";
import type { AriaCloudflareEnv } from "../lib/cloudflare/env";
import { drainLocalizationInvalidations } from "../lib/localization/invalidationDrain";
import { CloudflareStorageAdapter } from "../lib/storage/cloudflare";

/** Bounded scheduled retry for Phase 34's post-commit cache delivery. */
export async function reconcileLocalizationInvalidations(
  env: AriaCloudflareEnv,
): Promise<void> {
  const adapter = new CloudflareStorageAdapter({
    ...env,
  } as never);
  await drainLocalizationInvalidations({
    adapter,
    deliver: async (job) => {
      const payload = job.payload as {
        resourceType?: unknown;
        resourceId?: unknown;
        resourceIds?: unknown;
      };
      const resourceId =
        typeof payload.resourceId === "string" ? payload.resourceId : null;
      const resourceIds = Array.isArray(payload.resourceIds)
        ? payload.resourceIds.filter(
            (value): value is string => typeof value === "string" && value.length > 0,
          )
        : resourceId
          ? [resourceId]
          : [];
      const tags =
        resourceIds.length > 0 && payload.resourceType === "page"
          ? resourceIds.flatMap((id) =>
              getPublicPageCacheTags({ id, slug: id }),
            )
          : resourceId && payload.resourceType === "layout"
            ? [getPublicLayoutCacheTag(resourceId)]
            : [];
      if (tags.length === 0) {
        throw new Error(
          "Localization invalidation job has no targeted cache identity.",
        );
      }
      const delivered = await purgePublicCacheTags(
        { locals: { cfBindings: env } as never },
        tags,
      );
      if (!delivered)
        throw new Error("Cloudflare public cache purge was not acknowledged.");
    },
  });
}
