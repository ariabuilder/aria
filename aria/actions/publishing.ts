/**
 * Astro actions for publishing immutable page revisions. Integrates with global CSS
 * compilation and validates renderability before advancing the published page pointer.
 */

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import { touchContentRevisionForAction } from "../lib/content-sync/mutations";
import {
  createDefaultUniversalDesignSystem,
  getCustomFontsLibraryFromUniversalDesignSystem,
  type UniversalDesignSystem,
} from "../lib/styles/universalDesignSystem";
import {
  invalidateComposeCache,
  purgePublicPageCache,
} from "../lib/cache/service";
import {
  buildAuthorshipSaveContext,
  parseAuthorshipSaveContext,
} from "../lib/authorship/stamping";
import { buildPageActivityMetadata } from "../lib/pages/activityMetadata";
import { DiscoverySettingsSchema } from "../lib/crawl/schemas";
import { pingSearchEnginesForSitemap } from "../lib/seo/pingSitemap";
import { requireOperation, resolveAuthorizedMutation } from "./_shared";
import { log as baseLog } from "../lib/utils/logger";
import { getSiteSettingsUtilityEngine } from "../lib/storage/adapter";
import { regenerateGlobalCSSArtifacts } from "./styles";
import {
  deletePageSnapshots,
  savePageSnapshot,
} from "../lib/rendering/pageSnapshots";
import { assertExecutableContentChangeAllowed } from "../lib/security/executableContent";
import { buildCurrentCompilerMetadata } from "../lib/system/metadata";
import { resolvePagePublicationDependencies } from "../lib/publishing/pageDependencies";

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

async function getDesignSystem(
  adapter: PublishingStorageAdapter,
): Promise<UniversalDesignSystem> {
  return (
    (await adapter.getDesignSystem()) ?? createDefaultUniversalDesignSystem()
  );
}

export const PublishPageInputSchema = z.object({
  id: z.string().min(1).max(255),
  expectedVersion: z.string().trim().min(1),
  skipCSSRegeneration: z.boolean().optional(),
  scheduledFor: z.iso.datetime().optional(),
}).strict();

async function publishPageHandler(
  input: z.infer<typeof PublishPageInputSchema>,
  context: Parameters<typeof resolveAuthorizedMutation>[0],
) {
  const { user, authorship } = await resolveAuthorizedMutation(
    context,
    "publishing.publish",
    "save-page",
  );
  const parsedAuthorship = parseAuthorshipSaveContext(authorship);
  const stylesAuthorship = buildAuthorshipSaveContext(user, "save-styles");

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
    assertExecutableContentChangeAllowed({
      user,
      previousNodes: currentPage.nodes,
      nextNodes: currentPage.nodes,
      previousHeadHtml: currentPage.settings?.headHTML,
      nextHeadHtml: currentPage.settings?.headHTML,
    });

    if (!input.skipCSSRegeneration) {
      log("info", "Auto-regenerating CSS before publish");

      const result = await regenerateGlobalCSSArtifacts(adapter, {
        authorship: stylesAuthorship,
        utilityNodes: currentPage.nodes,
      });
      await settlePublishSideEffects("CSS revision", [
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

      log("info", "CSS regenerated successfully", {
        size: `${(result.cssSize / 1024).toFixed(2)}KB`,
        hash: result.globalCSSHash,
        framework: result.framework,
      });
    }

    const [siteSettings, designSystem] = await Promise.all([
      adapter.getSiteSettings(),
      getDesignSystem(adapter),
    ]);

    const framework = getSiteSettingsUtilityEngine(siteSettings);
    const darkMode = siteSettings?.darkMode || "disabled";
    const customFonts =
      getCustomFontsLibraryFromUniversalDesignSystem(designSystem);

    const hasCompiledCSS = Boolean(
      designSystem.artifacts.globalCSS && designSystem.artifacts.globalCSSHash,
    );
    const globalCSSEnabled = hasCompiledCSS;

    log("info", "Publish render validation config", {
      slug: canonicalSlug,
      framework,
      darkMode,
      globalCSSEnabled,
      hasCSSHash: designSystem.artifacts.globalCSSHash,
    });

    const { compileAnalyticsScripts } =
      await import("../lib/analytics/compileAnalyticsScripts");
    const { analyzeCustomCode } =
      await import("../lib/security/analyzeCustomCode");
    const {
      analyzeRenderPipelineRequirements,
      analyzeStructuredHead,
      planEffectiveCsp,
      renderCspMetaTag,
      serializeCspHeaderValue,
    } = await import("../lib/security/csp");

    const compiledAnalytics = compileAnalyticsScripts(siteSettings?.analytics);

    if (compiledAnalytics.warnings.length > 0) {
      log("warn", "Analytics compile warnings", {
        slug: canonicalSlug,
        warnings: compiledAnalytics.warnings,
      });
    }

    const customCodeAnalysis = analyzeCustomCode([
      { label: "site customHeadCode", code: siteSettings?.customHeadCode },
      { label: "site customBodyCode", code: siteSettings?.customBodyCode },
      {
        label: "site customFooterCode",
        code: siteSettings?.customFooterCode,
      },
      { label: "page headHTML", code: currentPage.settings?.headHTML },
    ]);

    const cspPlan = planEffectiveCsp({
      analytics: compiledAnalytics.csp,
      customCode: customCodeAnalysis,
      structuredHead: analyzeStructuredHead(currentPage.settings?.head),
      renderPipeline: analyzeRenderPipelineRequirements({
        framework,
        customFrameworkURL: siteSettings?.customFrameworkURL,
        globalCSSEnabled,
        customFonts,
        darkMode: darkMode === "disabled" ? undefined : darkMode,
        includesStructuredDataJsonLd: true,
      }),
    });

    if (cspPlan.warnings.length > 0) {
      log("warn", "CSP planning warnings", {
        slug: canonicalSlug,
        warnings: cspPlan.warnings,
        csp: serializeCspHeaderValue(cspPlan),
      });
    }

    const cspMetaTag = renderCspMetaTag(cspPlan);
    const publicationDependencies =
      await resolvePagePublicationDependencies(currentPage, adapter);

    const { renderPageDslToHtml } =
      await import("../lib/rendering/renderPageDslToHtml");
    const rendered = await renderPageDslToHtml({
      page: {
        ...currentPage,
        status: "published",
        _publicationDependencies: publicationDependencies,
      },
      adapter,
      pathOrSlug: currentPage.slug,
      headHTMLPrefix: cspMetaTag,
      locals: context.locals,
      logger: (level, message, meta) => log(level, message, meta),
    });
    const html = rendered.html;

    const htmlSize = html.length;
    const htmlSizeMB = (htmlSize / (1024 * 1024)).toFixed(2);
    const MAX_HTML_SIZE = 10 * 1024 * 1024;

    if (htmlSize > MAX_HTML_SIZE) {
      log("error", "Generated HTML exceeds 10MB limit", {
        size: `${htmlSizeMB}MB`,
      });
      return {
        success: false,
        error: {
          code: "HTML_TOO_LARGE",
          message: `Generated HTML (${htmlSizeMB}MB) exceeds 10MB limit. Page may be too complex.`,
          context: { htmlSize, limit: MAX_HTML_SIZE },
        },
      };
    }

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

    await settlePublishSideEffects("Publish", [
      async () => {
        const publishedPage = await adapter.getPublishedPageDSL(input.id);
        if (publishedPage) {
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
            mutationTarget: input.id,
          },
          context,
        ),
      () =>
        invalidateComposeCache(
          context,
          "page",
          currentPage.slug,
          publishedVersion,
          "publishing",
        ),
      () =>
        purgePublicPageCache(context, {
          id: input.id,
          slug: currentPage.slug,
        }),
    ]);

    const discovery = DiscoverySettingsSchema.parse(
      siteSettings?.discovery ?? {},
    );
    if (discovery.sitemapPingOnPublish) {
      try {
        await pingSearchEnginesForSitemap(siteSettings?.siteUrl);
      } catch (error) {
        log("warn", "Sitemap ping failed after publish", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log("info", `Page "${canonicalSlug}" marked as published`, {
      version: publishedVersion,
    });

    const duration = endPerformanceTracking(operation);

    log("info", "Page revision published successfully", {
      slug: canonicalSlug,
      size: `${(htmlSize / 1024).toFixed(2)}KB`,
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

        await adapter.unpublishPageDSL(id);
        await settlePublishSideEffects("Unpublish", [
          () => deletePageSnapshots(slug, adapter),
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
          () => purgePublicPageCache(context, { id, slug }),
        ]);

        log("info", `Page "${slug}" unpublished`);

        return {
          success: true,
          slug,
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
                dependencies:
                  await resolvePagePublicationDependencies(page, adapter),
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
                const publishedPage =
                  await adapter.getPublishedPageDSL(pageId);
                if (publishedPage) {
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
