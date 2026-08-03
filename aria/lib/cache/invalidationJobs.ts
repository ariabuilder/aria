import { z } from "zod";
import {
  CacheInvalidationJobSchema,
  type CacheInvalidationJob,
} from "../localization/siteTranslationSchemas";
import {
  getPublicLayoutCacheTag,
  getPublicPageCacheTags,
  purgePublicCacheTags,
  type CacheContext,
} from "./service";

export const PagePublicationInvalidationPayloadSchema = z
  .object({
    kind: z.literal("page-publication"),
    pageId: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    operation: z.enum(["publish", "scheduled-publish", "unpublish"]),
    version: z.string().trim().min(1).nullable(),
  })
  .strict();

export type PagePublicationInvalidationPayload = z.infer<
  typeof PagePublicationInvalidationPayloadSchema
>;

export function createPagePublicationInvalidationJob(input: {
  pageId: string;
  slug: string;
  operation: PagePublicationInvalidationPayload["operation"];
  version: string | null;
  now?: string;
}): CacheInvalidationJob {
  const now = input.now ?? new Date().toISOString();
  const payload = PagePublicationInvalidationPayloadSchema.parse({
    kind: "page-publication",
    pageId: input.pageId,
    slug: input.slug,
    operation: input.operation,
    version: input.version,
  });
  const idempotencyKey = [
    "public-route",
    payload.operation,
    payload.pageId,
    payload.version ?? "none",
  ].join(":");
  return CacheInvalidationJobSchema.parse({
    id: idempotencyKey.slice(0, 160),
    idempotencyKey,
    scope: "public-route",
    payload,
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: now,
    leaseToken: null,
    leaseExpiresAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  });
}

export async function deliverCacheInvalidationJob(
  context: CacheContext,
  job: CacheInvalidationJob,
): Promise<void> {
  const pagePublication = PagePublicationInvalidationPayloadSchema.safeParse(
    job.payload,
  );
  let tags: readonly string[] = [];

  if (pagePublication.success) {
    tags = getPublicPageCacheTags({
      id: pagePublication.data.pageId,
      slug: pagePublication.data.slug,
      version: pagePublication.data.version ?? undefined,
    });
  } else {
    const payload = job.payload;
    const resourceId =
      typeof payload.resourceId === "string" ? payload.resourceId : null;
    const resourceIds = Array.isArray(payload.resourceIds)
      ? payload.resourceIds.filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        )
      : resourceId
        ? [resourceId]
        : [];
    tags =
      resourceIds.length > 0 && payload.resourceType === "page"
        ? resourceIds.flatMap((id) => getPublicPageCacheTags({ id, slug: id }))
        : resourceId && payload.resourceType === "layout"
          ? [getPublicLayoutCacheTag(resourceId)]
          : [];
  }

  if (tags.length === 0) {
    throw new Error("Cache invalidation job has no targeted cache identity.");
  }
  if (!(await purgePublicCacheTags(context, tags))) {
    throw new Error("Workers public cache purge was not acknowledged.");
  }
}
