/** Astro actions for advancing immutable page publication pointers. */

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import {
  deliverContentRevisionForAction,
  touchContentRevision,
  touchContentRevisionForAction,
} from "../lib/content-sync/mutations";
import {
  invalidateComposeCache,
  purgePublicPageCache,
} from "../lib/cache/service";
import {
  createPagePublicationInvalidationJob,
  deliverCacheInvalidationJob,
} from "../lib/cache/invalidationJobs";
import { drainCacheInvalidations } from "../lib/localization/invalidationDrain";
import {
  buildAuthorshipSaveContext,
  parseAuthorshipSaveContext,
} from "../lib/authorship/stamping";
import { buildPageActivityMetadata } from "../lib/pages/activityMetadata";
import { requireOperation, resolveAuthorizedMutation } from "./_shared";
import { log as baseLog } from "../lib/utils/logger";
import { getSiteSettingsUtilityEngine } from "../lib/storage/adapter";
import { buildCurrentCompilerMetadata } from "../lib/system/metadata";
import { resolvePagePublicationDependencies } from "../lib/publishing/pageDependencies";
import { deferWithWaitUntil } from "../lib/cloudflare/waitUntil";
import type { PageDSL } from "../lib/types/nodes";

type LogLevel = "debug" | "info" | "warn" | "error";

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const prefix = `[Aria Publishing][${level.toUpperCase()}]`;

  baseLog(level, `${prefix} ${message}`, context);
}

const performanceMetrics: Map<string, { startTime: number }> = new Map();

type PublishingStorageAdapter = Awaited<
  ReturnType<typeof getStorageAdapterAsync>
>;

function startPerformanceTracking(operation: string): void {
  performanceMetrics.set(operation, { startTime: performance.now() });
}

function endPerformanceTracking(operation: string): number {
  const metrics = performanceMetrics.get(operation);
  if (!metrics) return 0;

  const duration = Math.round(performance.now() - metrics.startTime);
  performanceMetrics.delete(operation);
  return duration;
}

async function settlePublishSideEffects(
  label: string,
  tasks: Array<() => Promise<unknown>>,
): Promise<void> {
  const results = await Promise.allSettled(
    tasks.map((task) => Promise.resolve().then(task)),
  );
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      log("warn", `${label} side effect failed`, {
        index,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  });
}

type PublishingActionContext = Parameters<typeof resolveAuthorizedMutation>[0];

async function runCommittedPublishDelivery(
  adapter: PublishingStorageAdapter,
  context: PublishingActionContext,
  page: Pick<PageDSL, "id" | "slug">,
  publishedVersion: string,
): Promise<void> {
  await settlePublishSideEffects("Publish delivery", [
    async () => {
      const mutation = {
        mutationKind: "save-page" as const,
        mutationTarget: page.id,
      };
      const revision = await touchContentRevision(adapter, mutation, context);
      await deliverContentRevisionForAction(revision, mutation, context);
    },
    () =>
      invalidateComposeCache(
        context,
        "page",
        page.slug || page.id,
        publishedVersion,
        "publishing",
      ),
    async () => {
      const publishedPage = await adapter.getPublishedPageDSL(page.id);
      if (!publishedPage) return;
      const { savePageSnapshot } =
        await import("../lib/rendering/pageSnapshots");
      await savePageSnapshot(
        { page: publishedPage, stage: "published" },
        adapter,
        { locals: context.locals },
      );
    },
  ]);
}

async function deliverCommittedInvalidation(
  adapter: PublishingStorageAdapter,
  context: PublishingActionContext,
  jobId: string,
  force = false,
): Promise<"ready" | "pending"> {
  const existing = await adapter.getCacheInvalidationJob(jobId);
  if (existing?.status === "succeeded") return "ready";
  const result = await drainCacheInvalidations({
    adapter,
    jobId,
    limit: 1,
    deliveryAttempts: 3,
    force,
    deliver: (job) => deliverCacheInvalidationJob(context, job),
  });
  return result.completedJobIds.includes(jobId) ? "ready" : "pending";
}

async function scheduleCommittedPublishDelivery(
  adapter: PublishingStorageAdapter,
  context: PublishingActionContext,
  page: Pick<PageDSL, "id" | "slug">,
  publishedVersion: string,
): Promise<void> {
  const deliveryTask = Promise.resolve().then(() =>
    runCommittedPublishDelivery(adapter, context, page, publishedVersion),
  );

  if (deferWithWaitUntil(context.locals, deliveryTask)) {
    return;
  }

  await deliveryTask;
}

export const PublishPageInputSchema = z
  .object({
    id: z.string().min(1).max(255),
    expectedVersion: z.string().trim().min(1),
    skipCSSRegeneration: z.boolean().optional(),
    scheduledFor: z.iso.datetime().optional(),
  })
  .strict();

async function publishPageHandler(
  input: z.infer<typeof PublishPageInputSchema>,
  context: PublishingActionContext,
) {
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "publishing.publish",
    "save-page",
  );
  const parsedAuthorship = parseAuthorshipSaveContext(authorship);

  const operation = `publishPage:${input.id}`;
  startPerformanceTracking(operation);

  try {
    log("info", `Publishing page revision for "${input.id}"`);

    const adapter = await getStorageAdapterAsync(context.locals);
    const currentPage = await adapter.getPageDSL(input.id);
    if (!currentPage) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Page "${input.id}" was not found.`,
        },
      };
    }
    if (
      input.expectedVersion &&
      currentPage.version !== input.expectedVersion
    ) {
      return {
        success: false,
        error: {
          code: "VERSION_CONFLICT",
          message: "This draft is out of date. Reload it before publishing.",
        },
      };
    }
    const canonicalSlug = currentPage.slug || currentPage.id;
    // Phase 5 publishes an already-normalized immutable draft using the
    // stylesheet artifacts that were persisted by the style lifecycle. Full
    // site Uno compilation and public HTML assembly cannot share a 10 ms
    // Cloudflare request with the authoritative pointer transaction.
    void input.skipCSSRegeneration;
    const [siteSettings, designSystemArtifacts] = await Promise.all([
      adapter.getSiteSettings(),
      adapter.getDesignSystemSegments(["artifacts-meta"]),
    ]);

    const framework = getSiteSettingsUtilityEngine(siteSettings);
    const darkMode = siteSettings?.darkMode || "disabled";
    const globalCSSEnabled = Boolean(
      designSystemArtifacts?.artifacts.globalCSSHash,
    );
    const htmlSize = 0;

    log("info", "Publish pointer transaction config", {
      slug: canonicalSlug,
      framework,
      darkMode,
      globalCSSEnabled,
      cssSource: "stored-artifacts",
    });
    const publicationDependencies = await resolvePagePublicationDependencies(
      currentPage,
      adapter,
    );

    if (input.scheduledFor) {
      if (Date.parse(input.scheduledFor) <= Date.now()) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "scheduledFor must be in the future",
          },
        };
      }

      const scheduledVersion = await adapter.schedulePageDSL(
        input.id,
        input.scheduledFor,
        parsedAuthorship,
        {
          expectedVersion: input.expectedVersion,
          compilerMetadata: buildCurrentCompilerMetadata(),
          activityMetadata: buildPageActivityMetadata(
            parsedAuthorship,
            "page_scheduled",
            "this page",
          ),
        },
      );
      if (!scheduledVersion) {
        return {
          success: false,
          error: {
            code: "SCHEDULE_FAILED",
            message: `Unable to schedule page "${canonicalSlug}"`,
          },
        };
      }

      await settlePublishSideEffects("Schedule", [
        () =>
          touchContentRevisionForAction(
            adapter,
            {
              mutationKind: "save-page",
              mutationTarget: input.id,
            },
            context,
          ),
      ]);

      const duration = endPerformanceTracking(operation);
      log("info", `Page "${canonicalSlug}" scheduled for publish`, {
        version: scheduledVersion,
        scheduledFor: input.scheduledFor,
        duration: `${duration}ms`,
      });

      return {
        success: true,
        data: {
          slug: canonicalSlug,
          htmlSize,
          globalCSSEnabled,
          framework,
          darkMode,
          timestamp: new Date().toISOString(),
          published: false,
          scheduled: true,
          scheduledFor: input.scheduledFor,
          version: scheduledVersion,
        },
      };
    }

    const invalidationJob = createPagePublicationInvalidationJob({
      pageId: currentPage.id,
      slug: canonicalSlug,
      operation: "publish",
      version: input.expectedVersion,
    });
    const publishedVersion = await adapter.publishPageDSL(
      input.id,
      parsedAuthorship,
      {
        expectedVersion: input.expectedVersion,
        compilerMetadata: buildCurrentCompilerMetadata(),
        activityMetadata: buildPageActivityMetadata(
          parsedAuthorship,
          "page_published",
          "this page",
        ),
        dependencies: publicationDependencies,
        invalidationJob,
      },
    );
    if (!publishedVersion) {
      return {
        success: false,
        error: {
          code: "PUBLISH_FAILED",
          message: `Unable to publish page "${canonicalSlug}"`,
        },
      };
    }

    const delivery = await deliverCommittedInvalidation(
      adapter,
      context,
      invalidationJob.id,
    );
    const versionPins = await adapter.getPageVersionPins(currentPage.id);
    if (
      versionPins?.draftVersion !== publishedVersion ||
      versionPins.publishedVersion !== publishedVersion
    ) {
      throw new Error(
        "Published page revision could not be reconciled with its saved draft.",
      );
    }

    await scheduleCommittedPublishDelivery(
      adapter,
      context,
      currentPage,
      publishedVersion,
    );

    log("info", `Page "${canonicalSlug}" marked as published`, {
      version: publishedVersion,
    });

    const duration = endPerformanceTracking(operation);

    log("info", "Page revision published successfully", {
      slug: canonicalSlug,
      duration: `${duration}ms`,
      withCompiledCSS: globalCSSEnabled,
    });

    return {
      success: true,
      data: {
        slug: canonicalSlug,
        htmlSize,
        globalCSSEnabled,
        framework,
        darkMode,
        timestamp: new Date().toISOString(),
        published: true,
        version: publishedVersion,
        draftVersion: versionPins.draftVersion,
        publishedVersion: versionPins.publishedVersion,
        delivery,
        deliveryJobId: invalidationJob.id,
      },
    };
  } catch (error) {
    endPerformanceTracking(operation);
    log("error", "Page publish failed", { error });
    const errorCode =
      error && typeof error === "object"
        ? (error as { code?: unknown }).code
        : undefined;

    return {
      success: false,
      error: {
        code:
          errorCode === "VERSION_CONFLICT"
            ? "VERSION_CONFLICT"
            : "PUBLISH_FAILED",
        message: error instanceof Error ? error.message : "Publishing failed",
      },
    };
  }
}

export const publishing = {
  deliveryStatus: defineAction({
    accept: "json",
    input: z.object({ jobId: z.string().trim().min(1).max(160) }).strict(),
    handler: async ({ jobId }, context) => {
      await requireOperation(context, "publishing.publish");
      const adapter = await getStorageAdapterAsync(context.locals);
      const delivery = await deliverCommittedInvalidation(
        adapter,
        context,
        jobId,
        true,
      );
      return { success: true, data: { jobId, delivery } };
    },
  }),

  /**
   * Publish page by advancing the published revision pointer.
   *
   * Runtime delivery now comes from published page revisions rather than
   * stored HTML snapshots.
   *
   * @param id - Page ID
   * @param slug - URL slug for the page
   * @param title - Page title
   * @param description - Page description
   * @param layout - Optional layout ID to wrap the page
   * @param nodes - Page DSL nodes
   * @param settings - Page settings (breakpoints, SEO, etc.)
   * @param skipCSSRegeneration - Skip CSS regeneration if already current
   */
  publish: defineAction({
    accept: "json",
    input: PublishPageInputSchema,
    handler: publishPageHandler,
  }),

  /**
   * @deprecated Use publishing.publish.
   *
   * Backward-compat alias for publishing.publish.
   */
  snapshot: defineAction({
    accept: "json",
    input: PublishPageInputSchema,
    handler: publishPageHandler,
  }),

  /**
   * Unpublish a page
   *
   * Clears the published revision pointer and returns the page to draft-only.
   *
   * @param id - Page ID
   * @param slug - URL slug of the published page
   * @returns Unpublish result
   */
  unpublish: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1).max(255),
      slug: z.string().min(1).max(255),
    }),
    handler: async ({ id, slug }, context) => {
      await requireOperation(context, "publishing.unpublish");

      try {
        log("info", `Unpublishing page "${slug}"`);

        const adapter = await getStorageAdapterAsync(context.locals);

        const currentPage = await adapter.getPageDSL(id);
        const invalidationJob = createPagePublicationInvalidationJob({
          pageId: id,
          slug,
          operation: "unpublish",
          version: currentPage?.version ?? null,
        });
        await adapter.unpublishPageDSL(id, { invalidationJob });
        const delivery = await deliverCommittedInvalidation(
          adapter,
          context,
          invalidationJob.id,
        );
        await settlePublishSideEffects("Unpublish", [
          async () => {
            const { deletePageSnapshots } =
              await import("../lib/rendering/pageSnapshots");
            await deletePageSnapshots(slug, adapter);
          },
          // Keep published thumbnail — PagePreviewFrame falls back to it while
          // a fresh draft thumbnail is generated, avoiding a blank flash.
          () =>
            touchContentRevisionForAction(
              adapter,
              {
                mutationKind: "save-page",
                mutationTarget: id,
              },
              context,
            ),
          () =>
            invalidateComposeCache(
              context,
              "page",
              slug,
              undefined,
              "publishing",
            ),
        ]);

        log("info", `Page "${slug}" unpublished`);

        return {
          success: true,
          slug,
          delivery,
          deliveryJobId: invalidationJob.id,
        };
      } catch (error) {
        log("error", "Unpublish failed", { error });
        return {
          success: false,
          error: {
            code: "UNPUBLISH_FAILED",
            message:
              error instanceof Error ? error.message : "Unpublish failed",
          },
        };
      }
    },
  }),

  /**
   * Archive a page
   *
   * Sets the page status to 'archived' so it is no longer visible
   * in the Studio or public site.
   *
   * @param id - Page ID
   * @param slug - URL slug of the page
   */
  archive: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1).max(255),
      slug: z.string().min(1).max(255),
    }),
    handler: async ({ id, slug }, context) => {
      await requireOperation(context, "publishing.archive");

      try {
        log("info", `Archiving page "${slug}"`);

        const adapter = await getStorageAdapterAsync(context.locals);
        await adapter.archivePageDSL(id);
        await settlePublishSideEffects("Archive", [
          () =>
            touchContentRevisionForAction(
              adapter,
              {
                mutationKind: "save-page",
                mutationTarget: id,
              },
              context,
            ),
          () =>
            invalidateComposeCache(
              context,
              "page",
              slug,
              undefined,
              "publishing",
            ),
          () => purgePublicPageCache(context, { id, slug }),
        ]);

        log("info", `Page "${slug}" archived`);

        return {
          success: true,
          slug,
        };
      } catch (error) {
        log("error", "Archive failed", { error });
        return {
          success: false,
          error: {
            code: "ARCHIVE_FAILED",
            message: error instanceof Error ? error.message : "Archive failed",
          },
        };
      }
    },
  }),

  /**
   * Unarchive a page
   *
   * Restores an archived page to draft (or published if a published_version
   * still exists).
   *
   * @param id - Page ID
   * @param slug - URL slug of the page
   */
  unarchive: defineAction({
    accept: "json",
    input: z.object({
      id: z.string().min(1).max(255),
      slug: z.string().min(1).max(255),
    }),
    handler: async ({ id, slug }, context) => {
      await requireOperation(context, "publishing.unarchive");

      try {
        log("info", `Unarchiving page "${slug}"`);

        const adapter = await getStorageAdapterAsync(context.locals);
        await adapter.unarchivePageDSL(id);
        await settlePublishSideEffects("Unarchive", [
          () =>
            touchContentRevisionForAction(
              adapter,
              {
                mutationKind: "save-page",
                mutationTarget: id,
              },
              context,
            ),
          () =>
            invalidateComposeCache(
              context,
              "page",
              slug,
              undefined,
              "publishing",
            ),
        ]);

        log("info", `Page "${slug}" unarchived`);

        return {
          success: true,
          slug,
        };
      } catch (error) {
        log("error", "Unarchive failed", { error });
        return {
          success: false,
          error: {
            code: "UNARCHIVE_FAILED",
            message:
              error instanceof Error ? error.message : "Unarchive failed",
          },
        };
      }
    },
  }),

  /**
   * Publish all pages in batch
   *
   * Publishes multiple pages sequentially by advancing their published
   * revision pointers.
   *
   * @param pageIds - Array of page IDs to publish
   * @returns Batch result with success/failure counts
   */
  batchPublish: defineAction({
    accept: "json",
    input: z.object({
      pageIds: z.array(z.string().min(1)).min(1),
      skipCSSRegeneration: z.boolean().optional().default(false),
    }),
    handler: async ({ pageIds, skipCSSRegeneration }, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "publishing.batchPublish",
        "save-page",
      );
      const parsedAuthorship = parseAuthorshipSaveContext(authorship);
      const stylesAuthorship = buildAuthorshipSaveContext(user, "save-styles");

      const results = {
        published: [] as string[],
        failed: [] as { id: string; error: string }[],
      };

      try {
        const adapter = await getStorageAdapterAsync(context.locals);

        // Regenerate CSS once before batch (if needed)
        if (!skipCSSRegeneration) {
          log("info", "Regenerating CSS before batch publish");

          const { regenerateGlobalCSSArtifacts } = await import("./styles");
          const result = await regenerateGlobalCSSArtifacts(adapter, {
            authorship: stylesAuthorship,
          });
          await settlePublishSideEffects("Batch CSS revision", [
            () =>
              touchContentRevisionForAction(
                adapter,
                {
                  mutationKind: "save-styles",
                  mutationTarget: "default",
                },
                context,
              ),
          ]);

          log("info", "Batch publish CSS regeneration complete", {
            size: `${(result.cssSize / 1024).toFixed(2)}KB`,
            hash: result.globalCSSHash,
            framework: result.framework,
          });
        }

        // Process pages sequentially to avoid overwhelming the system
        for (const pageId of pageIds) {
          try {
            const page = await adapter.getPageDSL(pageId);
            if (!page) {
              results.failed.push({ id: pageId, error: "Page not found" });
              continue;
            }
            if (!page.version) {
              results.failed.push({
                id: pageId,
                error: "Page has no saved revision to publish",
              });
              continue;
            }

            const publishedVersion = await adapter.publishPageDSL(
              pageId,
              parsedAuthorship,
              {
                expectedVersion: page.version,
                compilerMetadata: buildCurrentCompilerMetadata(),
                activityMetadata: buildPageActivityMetadata(
                  parsedAuthorship,
                  "page_published",
                  "this page",
                ),
                dependencies: await resolvePagePublicationDependencies(
                  page,
                  adapter,
                ),
              },
            );
            if (!publishedVersion) {
              results.failed.push({
                id: pageId,
                error: "Failed to publish page",
              });
              continue;
            }

            await settlePublishSideEffects(`Batch publish ${pageId}`, [
              async () => {
                const publishedPage = await adapter.getPublishedPageDSL(pageId);
                if (publishedPage) {
                  const { savePageSnapshot } =
                    await import("../lib/rendering/pageSnapshots");
                  await savePageSnapshot(
                    {
                      page: publishedPage,
                      stage: "published",
                    },
                    adapter,
                    { locals: context.locals },
                  );
                }
              },
              () =>
                touchContentRevisionForAction(
                  adapter,
                  {
                    mutationKind: "save-page",
                    mutationTarget: pageId,
                  },
                  context,
                ),
              () =>
                invalidateComposeCache(
                  context,
                  "page",
                  page.slug || pageId,
                  publishedVersion,
                  "publishing",
                ),
              () =>
                purgePublicPageCache(context, {
                  id: pageId,
                  slug: page.slug || pageId,
                }),
            ]);

            results.published.push(pageId);
          } catch (error) {
            results.failed.push({
              id: pageId,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        log("info", "Batch publish completed", {
          published: results.published.length,
          failed: results.failed.length,
        });

        return {
          success: results.failed.length === 0,
          ...results,
        };
      } catch (error) {
        log("error", "Batch publish failed", { error });
        return {
          success: false,
          ...results,
          error: {
            code: "BATCH_PUBLISH_FAILED",
            message:
              error instanceof Error ? error.message : "Batch publish failed",
          },
        };
      }
    },
  }),
};
