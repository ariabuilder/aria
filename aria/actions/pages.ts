/**
 * Astro actions for page metadata, SEO management, and page-specific operations.
 */

import {
  ActionError,
  defineAction,
  type ActionAPIContext,
} from "astro:actions";
import { z } from "astro/zod";
import { JsonObjectSchema } from "../lib/schemas/json";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import { touchContentRevisionForAction } from "../lib/content-sync/mutations";
import type { BuilderNode, PageDSL } from "../lib/types/nodes";
import {
  generateSecureToken,
  getClientIp,
  hashToken,
  verifyPassword,
} from "../lib/auth";
import {
  PagePolicyValidationError,
  PagePolicyResultSchema,
  VerifyPageAccessPasswordResultSchema,
  resolvePageAccessSessionExpiry,
  resolvePagePolicyUpdate,
  sanitizePagePolicy,
  setPageAccessCookie,
} from "../lib/pages/policy";
import {
  collectionsRequiringClearForRoleChange,
  validateCmsEntryAccessModeSave,
  validateCmsCollectionRoleSave,
  validateCmsEntryRoleSave,
  type CmsTemplatePolicyPageRef,
} from "../lib/pages/cmsTemplatePolicy";
import { StoredPageSystemRoleSchema } from "../lib/storage/adapter";
import type { StorageAdapter } from "../lib/storage/adapter";
import type { AuthorshipSaveContext } from "../lib/storage/adapter";
import type { VersionSaveOptions } from "../lib/storage/versioning";
import { invalidateCollectionPublicCache } from "../lib/cms/invalidateEntryCache";
import { parseAuthorshipSaveContext } from "../lib/authorship/stamping";
import { formatActorDisplayName } from "../lib/authorship/reads";
import {
  buildUserAvatarLookup,
  resolveActorAvatarUrl,
} from "../lib/authorship/avatarLookup";
import { getAuthAdapterAsync } from "../lib/auth/getAuthAdapter";
import {
  invalidateComposeCache,
  requireCapability,
  requireOperation,
  resolveAuthorizedMutation,
} from "./_shared";
import { log as baseLog } from "../lib/utils/logger";
import {
  buildPageSnapshotAdminUrl,
  resolvePagePreviewStage,
  savePageSnapshot,
} from "../lib/rendering/pageSnapshots";
import {
  buildPageThumbnailAdminUrlWhenStored,
  buildPageThumbnailAdminUrl,
  PageThumbnailDeleteInputSchema,
  PageThumbnailDeleteResponseSchema,
  PageThumbnailSaveInputSchema,
  PageThumbnailSaveResponseSchema,
} from "../lib/rendering/pageThumbnails";
import {
  enqueueOrGeneratePageThumbnail,
  PageThumbnailJobResultSchema,
} from "../lib/rendering/pageThumbnailServer";
import {
  buildThumbnailFingerprint,
  buildThumbnailState,
} from "../lib/rendering/thumbnailArtifacts";
import { getSiteStyleRevision } from "../lib/storage/adapter";
import {
  GetPageActivityInputSchema,
  GetPageActivityOutputSchema,
  type ActivityAction,
} from "../lib/schemas/activity";
import { isUserActivityMetadata } from "../lib/schemas/activityActors";
import { resolvePageVersionActivityMetadata } from "../lib/pages/resolvePageVersionActivity";
import { buildPageActivityMetadata } from "../lib/pages/activityMetadata";
import {
  GetPageVersionsInputSchema,
  GetPageVersionsOutputSchema,
  GetVersionSnapshotInputSchema,
  GetVersionSnapshotOutputSchema,
  RevertVersionInputSchema,
  RevertVersionOutputSchema,
  DeleteVersionInputSchema,
  DeleteVersionOutputSchema,
} from "@/features/Studio/pages/composables/usePageRevert";
import { collectProtectedPageVersions } from "../lib/storage/pageVersionDelete";
import { buildVersionDisplayNumbers } from "@/features/Studio/pages/utils/versionHistoryFormatters";
import {
  GetPageMediaInputSchema,
  GetPageMediaOutputSchema,
} from "../lib/schemas/pageMedia";
import { resolvePageMediaAssets } from "../lib/media/catalog/resolvePageMediaAssets";
import { MediaCatalogRepository } from "../lib/media/catalog/repository";
import {
  UpdateCoverImageInputSchema,
  UpdateCoverImageOutputSchema,
  RemoveCoverImageInputSchema,
  RemoveCoverImageOutputSchema,
} from "../lib/schemas/cover";

type LogLevel = "debug" | "info" | "warn" | "error";

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const prefix = `[Aria Pages][${level.toUpperCase()}]`;

  baseLog(level, `${prefix} ${message}`, context);
}

const performanceMetrics = new Map<string, { startTime: number }>();

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

const ERROR_CODES = {
  PAGE_NOT_FOUND: "PAGE_NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  UPDATE_FAILED: "UPDATE_FAILED",
  SECTION_NOT_FOUND: "SECTION_NOT_FOUND",
  SECTION_REORDER_FAILED: "SECTION_REORDER_FAILED",
} as const;

/**
 * SEO metadata schema matching PageDSL.settings.seo
 */
const ReorderSectionsInputSchema = z.object({
  slug: z.string().min(1, "Page slug is required"),
  sectionIds: z
    .array(z.string().min(1))
    .min(1, "At least one section ID is required"),
});

const ReorderSectionsOutputSchema = z.object({
  version: z.string(),
});

const EnqueuePageThumbnailInputSchema = z.object({
  pageId: PageThumbnailSaveInputSchema.shape.pageId,
  pageSlug: z.string().trim().min(1),
  stage: PageThumbnailSaveInputSchema.shape.stage,
  force: z.boolean().optional(),
});

const SeoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  canonical: z.string().optional(),
  noindex: z.boolean().optional(),
  nofollow: z.boolean().optional(),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  ogImage: z.string().optional(),
  ogType: z.string().optional(),
  twitterCard: z
    .enum(["summary", "summary_large_image", "app", "player"])
    .optional(),
  twitterSite: z.string().optional(),
  twitterCreator: z.string().optional(),
  structuredData: JsonObjectSchema.optional(),
});

/**
 * Frontmatter field type for response
 */

/**
 * Layout info for page metadata response
 */

const PagePolicySlugInputSchema = z
  .object({
    slug: z.string().trim().min(1, "Page slug is required"),
  })
  .strict();

const PageDetailBundleInputSchema = z
  .object({
    slug: z.string().trim().min(1, "Page slug is required"),
    activityLimit: z.int().min(1).max(20).default(5),
  })
  .strict();

const UpdatePagePolicyInputSchema = z
  .object({
    slug: z.string().trim().min(1, "Page slug is required"),
    systemRole: StoredPageSystemRoleSchema,
    accessMode: z.enum(["public", "password", "private", "unlisted"]),
    newPassword: z.string().max(4096).optional(),
    clearPassword: z.boolean().optional(),
    promptTitle: z.string().optional(),
    promptDescription: z.string().optional(),
    rememberForDays: z.int().min(1).max(30).nullable().optional(),
  })
  .strict();

async function listPolicyValidationPages(
  adapter: StorageAdapter,
): Promise<CmsTemplatePolicyPageRef[]> {
  const pages = await adapter.listPagesDSL({ limit: 1000, offset: 0 });
  return pages.map((page) => ({
    id: page.id,
    slug: page.slug ?? page.id,
    parent: page.parent ?? null,
    systemRole: page.systemRole,
  }));
}

const VerifyPageAccessPasswordInputSchema = z
  .object({
    slug: z.string().trim().min(1, "Page slug is required"),
    password: z.string().min(1, "Password is required").max(4096),
  })
  .strict();

type PersistPageDraftOptions = {
  versionSaveOptions?: VersionSaveOptions;
  activityAction?: ActivityAction;
  activityTarget?: string;
  snapshot?: boolean;
  revisionTouch?: boolean;
  invalidateCache?: boolean;
};

async function persistPageDraft(
  adapter: StorageAdapter,
  context: ActionAPIContext,
  page: PageDSL,
  authorship: AuthorshipSaveContext,
  options?: PersistPageDraftOptions,
): Promise<string> {
  const parsedAuthorship = parseAuthorshipSaveContext(authorship);
  const activityMetadata = buildPageActivityMetadata(
    parsedAuthorship,
    options?.activityAction ?? "page_updated",
    options?.activityTarget ?? "this page",
  );
  const version = await adapter.savePageDSL(
    page.id,
    page,
    {
      ...options?.versionSaveOptions,
      activityMetadata,
    },
    parsedAuthorship,
  );

  if (options?.snapshot !== false) {
    await savePageSnapshot(
      {
        page,
        stage: "draft",
      },
      adapter,
      { locals: context.locals },
    );
  }

  if (options?.revisionTouch !== false) {
    await touchContentRevisionForAction(
      adapter,
      {
        mutationKind: "save-page",
        mutationTarget: page.id,
      },
      context,
    );
  }

  if (options?.invalidateCache) {
    await invalidateComposeCache(
      context,
      "page",
      page.slug ?? page.id,
      version,
      "crud",
    );
  }

  return version;
}

function countNodes(nodes: BuilderNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count++;
    if (node.children && Array.isArray(node.children)) {
      count += countNodes(node.children);
    }
  }
  return count;
}

/**
 * Determine the type of a value for frontmatter display
 */
function getValueType(
  value: unknown,
): "string" | "number" | "boolean" | "array" | "object" | "date" {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (typeof value === "object" && value !== null) return "object";
  return "string";
}

async function assertPageAccessPasswordRateLimit(input: {
  context: ActionAPIContext;
  slug: string;
  ip: string;
  maxRequests: number;
  windowMs: number;
}): Promise<void> {
  const adapter = await getStorageAdapterAsync(input.context.locals);
  const result = await adapter.consumeRateLimit({
    scope: `page-access-password:${input.slug}`,
    subject: input.ip,
    limit: input.maxRequests,
    windowMs: input.windowMs,
  });

  if (!result.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.resetAt - Date.now()) / 1000),
    );
    throw new ActionError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many password attempts. Try again in ${retryAfterSeconds}s.`,
    });
  }
}

export const pages = {
  saveThumbnail: defineAction({
    accept: "form",
    input: PageThumbnailSaveInputSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMutation(
        context,
        "pages.saveThumbnail",
        "save-page",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      const page =
        input.stage === "published"
          ? await adapter.getPublishedPageDSL(input.pageId)
          : await adapter.getPageDSL(input.pageId);
      if (!page) {
        throw new ActionError({ code: "NOT_FOUND", message: "Page not found" });
      }

      await adapter.savePageThumbnail(input.pageId, input.file, input.stage);
      const siteSettings = await adapter.getSiteSettings();
      return PageThumbnailSaveResponseSchema.parse({
        success: true,
        data: {
          pageId: input.pageId,
          stage: input.stage,
          contentType: input.file.type,
          size: input.file.size,
          thumbnailUrl: buildPageThumbnailAdminUrl(
            page.id,
            input.stage,
            page.updatedAt ?? null,
            getSiteStyleRevision(siteSettings),
          ),
        },
      });
    },
  }),

  deleteThumbnail: defineAction({
    accept: "json",
    input: PageThumbnailDeleteInputSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMutation(
        context,
        "pages.deleteThumbnail",
        "save-page",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      await adapter.deletePageThumbnail(input.pageId, input.stage);
      return PageThumbnailDeleteResponseSchema.parse({
        success: true,
        data: {
          pageId: input.pageId,
          deletedStages: input.stage ? [input.stage] : ["draft", "published"],
        },
      });
    },
  }),

  enqueueThumbnail: defineAction({
    accept: "json",
    input: EnqueuePageThumbnailInputSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMutation(
        context,
        "pages.enqueueThumbnail",
        "save-page",
      );
      const result = await enqueueOrGeneratePageThumbnail({
        adapter: await getStorageAdapterAsync(context.locals),
        locals: context.locals,
        pageId: input.pageId,
        pageSlug: input.pageSlug,
        stage: input.stage,
        force: input.force,
      });
      return PageThumbnailJobResultSchema.parse(result);
    },
  }),

  /**
   * List page inventory metadata for Studio/admin inventory refreshes.
   *
   * Returns the same page metadata shape used by builder init without the
   * unrelated layouts/components payload.
   */
  listInventory: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireOperation(context, "pages.listInventory");

      const operation = "listPageInventory";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        // `listPagesDSL` now surfaces the policy summary fields, so the
        // separate `listPagePolicySummaries()` round-trip is no longer needed.
        const [inventory, siteSettings, storedThumbnailKeys] =
          await Promise.all([
            adapter.listPagesDSL(),
            adapter.getSiteSettings(),
            adapter.listStoredPageThumbnailKeys(),
          ]);
        const styleRevision = getSiteStyleRevision(siteSettings);

        const duration = endPerformanceTracking(operation);
        log("debug", "Page inventory loaded", {
          count: inventory?.length || 0,
          duration: `${duration}ms`,
        });

        return {
          pages: (inventory || []).map((page) => ({
            ...page,
            systemRole: page.systemRole ?? "standard",
            accessMode: page.accessMode ?? "public",
            hasPassword: page.hasPassword ?? false,
            isModifiedSincePublish: page.isModifiedSincePublish ?? false,
            authorship: page.authorship,
            snapshotUrl: buildPageSnapshotAdminUrl(
              page.slug ?? page.id,
              resolvePagePreviewStage(page),
              page.updatedAt,
              styleRevision,
            ),
            ...(() => {
              const stage = resolvePagePreviewStage(page);
              const thumbnailUrl = buildPageThumbnailAdminUrlWhenStored(
                storedThumbnailKeys,
                page.id,
                stage,
                page.updatedAt,
                styleRevision,
              );
              return {
                thumbnailUrl,
                thumbnail: buildThumbnailState({
                  url: thumbnailUrl,
                  stage,
                  fingerprint: buildThumbnailFingerprint({
                    kind: "page",
                    targetId: page.id,
                    stage,
                    sourceVersion:
                      "version" in page && typeof page.version === "string"
                        ? page.version
                        : null,
                    updatedAt: page.updatedAt,
                    styleRevision,
                    capturePreset: "page-grid-desktop-16x9",
                  }),
                  updatedAt: page.updatedAt,
                }),
              };
            })(),
          })),
        };
      } catch (error) {
        endPerformanceTracking(operation);
        log("error", "Failed to list page inventory", { error });
        throw error;
      }
    },
  }),

  getDetailBundle: defineAction({
    accept: "json",
    input: PageDetailBundleInputSchema,
    handler: async ({ slug }, context) => {
      await requireOperation(context, "pages.getDetailBundle");

      const operation = `getPageDetailBundle:${slug}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(slug);

        if (!page) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Page not found: ${slug}`,
          });
        }

        const duration = endPerformanceTracking(operation);
        log("debug", "Page detail core loaded", {
          slug,
          duration: `${duration}ms`,
        });

        return {
          page,
          // Inventory metadata is already hydrated by init/listInventory.
          // Policy, activity, versions, media, and preview artifacts load from
          // their dedicated endpoints only when their UI surfaces need them.
          inventory: null,
          policy: null,
          activity: null,
          updatedAt: page.updatedAt ?? null,
          preview: null,
          serverTiming: [`${operation};dur=${duration}`],
        };
      } catch (error) {
        endPerformanceTracking(operation);
        log("error", "Failed to load page detail bundle", { slug, error });
        throw error;
      }
    },
  }),

  getPolicy: defineAction({
    accept: "json",
    input: PagePolicySlugInputSchema,
    handler: async ({ slug }, context) => {
      await requireCapability(context, "manageSecurity");

      const operation = `getPagePolicy:${slug}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const policy = await adapter.getPagePolicy(slug);

        if (!policy) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Page not found: ${slug}`,
          });
        }

        const duration = endPerformanceTracking(operation);
        log("debug", `Page policy loaded: ${slug}`, {
          duration: `${duration}ms`,
        });

        return PagePolicyResultSchema.parse(sanitizePagePolicy(policy));
      } catch (error) {
        endPerformanceTracking(operation);
        log("error", "Failed to get page policy", { slug, error });
        throw error;
      }
    },
  }),

  updatePolicy: defineAction({
    accept: "json",
    input: UpdatePagePolicyInputSchema,
    handler: async (input, context) => {
      await requireCapability(context, "manageSecurity");

      const operation = `updatePagePolicy:${input.slug}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const existingPolicy = await adapter.getPagePolicy(input.slug);

        if (!existingPolicy) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Page not found: ${input.slug}`,
          });
        }

        if (input.systemRole === "not-found") {
          const currentNotFoundOwner =
            await adapter.getPagePolicyBySystemRole("not-found");

          if (
            currentNotFoundOwner &&
            currentNotFoundOwner.id !== existingPolicy.id
          ) {
            throw new ActionError({
              code: "CONFLICT",
              message: "Only one page may own the 404 role.",
            });
          }
        }

        const [collections, policyPages] = await Promise.all([
          adapter.listCollections(),
          listPolicyValidationPages(adapter),
        ]);

        const cmsEntryValidation = validateCmsEntryRoleSave({
          policy: existingPolicy,
          nextSystemRole: input.systemRole,
          nextAccessMode: input.accessMode,
          collections,
          pages: policyPages,
        });
        if (!cmsEntryValidation.valid) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message:
              cmsEntryValidation.message ??
              "CMS Entry page settings are invalid.",
          });
        }

        const cmsCollectionValidation = validateCmsCollectionRoleSave({
          policy: existingPolicy,
          nextSystemRole: input.systemRole,
          collections,
          pages: policyPages,
        });
        if (!cmsCollectionValidation.valid) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message:
              cmsCollectionValidation.message ??
              "CMS Collection page settings are invalid.",
          });
        }

        const accessModeValidation = validateCmsEntryAccessModeSave({
          systemRole: input.systemRole,
          accessMode: input.accessMode,
        });
        if (!accessModeValidation.valid) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message:
              accessModeValidation.message ??
              "CMS Entry page access settings are invalid.",
          });
        }

        // A page can only ever hold one CMS role. Switching roles manually
        // from the Page Type tab auto-clears any collection bindings that
        // pointed at this page in a role it no longer holds — the user
        // never has to remember to go untangle the collection side first.
        const assignmentClears = collectionsRequiringClearForRoleChange({
          pageId: existingPolicy.id,
          nextSystemRole: input.systemRole,
          collections,
        });

        const resolvedUpdate = await resolvePagePolicyUpdate({
          existingPolicy,
          nextPolicy: {
            systemRole: input.systemRole,
            accessMode: input.accessMode,
            newPassword: input.newPassword,
            clearPassword: input.clearPassword,
            promptTitle: input.promptTitle,
            promptDescription: input.promptDescription,
            rememberForDays: input.rememberForDays,
          },
        });

        const savedPolicy = await adapter.savePagePolicy({
          idOrSlug: existingPolicy.id,
          systemRole: resolvedUpdate.systemRole,
          accessMode: resolvedUpdate.accessMode,
          accessPasswordHash: resolvedUpdate.accessPasswordHash,
          accessPromptTitle: resolvedUpdate.accessPromptTitle,
          accessPromptDescription: resolvedUpdate.accessPromptDescription,
          accessRememberForDays: resolvedUpdate.accessRememberForDays,
          accessPolicyVersion: resolvedUpdate.accessPolicyVersion,
        });

        if (!savedPolicy) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Page not found: ${input.slug}`,
          });
        }

        if (resolvedUpdate.shouldDeleteExistingSessions) {
          await adapter.deletePageAccessSessionsForPage(existingPolicy.id);
        }

        if (assignmentClears.length > 0) {
          const collectionsById = new Map(
            collections.map((collection) => [collection.id, collection]),
          );
          for (const clear of assignmentClears) {
            const collection = collectionsById.get(clear.collectionId);
            if (!collection) continue;
            await adapter.saveCollection({
              ...collection,
              [clear.field]: null,
              updatedAt: new Date().toISOString(),
            });
            await invalidateCollectionPublicCache(
              adapter,
              context,
              clear.collectionId,
            );
          }
        }

        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-page-metadata",
            mutationTarget: existingPolicy.id,
          },
          context,
        );

        const duration = endPerformanceTracking(operation);
        log("info", `Page policy updated: ${input.slug}`, {
          duration: `${duration}ms`,
          accessDecisionChanged: resolvedUpdate.accessDecisionChanged,
          clearedAssignments: assignmentClears.length,
        });

        return PagePolicyResultSchema.parse({
          ...sanitizePagePolicy(savedPolicy),
          clearedAssignments:
            assignmentClears.length > 0
              ? assignmentClears.map((clear) => ({
                  collectionLabel: clear.collectionLabel,
                  field: clear.field,
                }))
              : undefined,
        });
      } catch (error) {
        endPerformanceTracking(operation);
        log("error", "Failed to update page policy", {
          slug: input.slug,
          error,
        });

        if (error instanceof PagePolicyValidationError) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        throw error;
      }
    },
  }),

  verifyAccessPassword: defineAction({
    accept: "json",
    input: VerifyPageAccessPasswordInputSchema,
    handler: async ({ slug, password }, context) => {
      const operation = `verifyPageAccessPassword:${slug}`;
      startPerformanceTracking(operation);

      try {
        const ip = getClientIp(context.request);
        await assertPageAccessPasswordRateLimit({
          context,
          slug,
          ip,
          maxRequests: 10,
          windowMs: 20 * 60 * 1000,
        });

        const adapter = await getStorageAdapterAsync(context.locals);
        const policy = await adapter.getPagePolicy(slug);

        if (
          !policy ||
          !policy.publishedVersion ||
          policy.accessMode !== "password" ||
          !policy.accessPasswordHash
        ) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Password access is not available for this page.",
          });
        }

        const passwordValid = await verifyPassword(
          password,
          policy.accessPasswordHash,
        );

        if (!passwordValid) {
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: "Incorrect password.",
          });
        }

        const rawToken = generateSecureToken();
        const tokenHash = await hashToken(rawToken);
        const expiresAt = resolvePageAccessSessionExpiry(
          policy.accessRememberForDays,
        );

        await adapter.createPageAccessSession({
          tokenHash,
          pageId: policy.id,
          policyVersion: policy.accessPolicyVersion,
          expiresAt,
        });

        setPageAccessCookie({
          cookies: context.cookies,
          pageId: policy.id,
          token: rawToken,
          rememberForDays: policy.accessRememberForDays,
        });

        const duration = endPerformanceTracking(operation);
        log("info", `Page password verified: ${slug}`, {
          duration: `${duration}ms`,
        });

        return VerifyPageAccessPasswordResultSchema.parse({ success: true });
      } catch (error) {
        endPerformanceTracking(operation);
        log("warn", "Failed page password verification", {
          slug,
          error,
        });
        throw error;
      }
    },
  }),

  /**
   * Get page metadata
   *
   * Fetches SEO, layout, frontmatter, and stats for a specific page.
   * Used by the sidebar metadata panel.
   *
   * @param slug - Page slug/identifier
   * @returns Page metadata including SEO, layout info, and stats
   */
  getMeta: defineAction({
    accept: "json",
    input: z.object({
      slug: z.string().min(1, "Page slug is required"),
    }),
    handler: async ({ slug }, context) => {
      await requireOperation(context, "pages.getMeta");

      const operation = `getPageMeta:${slug}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(slug);

        if (!page) {
          endPerformanceTracking(operation);
          return {
            success: false,
            error: {
              code: ERROR_CODES.PAGE_NOT_FOUND,
              message: `Page not found: ${slug}`,
            },
          };
        }

        // Get layout info if page has one
        let layoutInfo = {
          slug: null as string | null,
          name: null as string | null,
          hasHeader: false,
          hasFooter: false,
        };

        if (page.layout) {
          const layout = await adapter.getLayoutDSL(page.layout);
          if (layout) {
            layoutInfo = {
              slug: layout.slug ?? null,
              name: layout.name ?? layout.slug ?? null,
              hasHeader: !!layout.regions?.headerComponent,
              hasFooter: !!layout.regions?.footerComponent,
            };
          }
        }

        // Extract SEO from page settings
        const seo = {
          title: page.settings?.seo?.title ?? page.title,
          description: page.settings?.seo?.description ?? "",
          keywords: page.settings?.seo?.keywords ?? [],
          ogImage: page.settings?.seo?.ogImage,
          noIndex: page.settings?.seo?.noindex ?? false,
          noFollow: page.settings?.seo?.nofollow ?? false,
          canonical: page.settings?.seo?.canonical,
        };

        // Extract frontmatter fields (excluding internal fields)
        const frontmatter: Array<{
          key: string;
          value: unknown;
          type: "string" | "number" | "boolean" | "array" | "object" | "date";
        }> = [];

        const internalKeys = new Set([
          "slug",
          "title",
          "layout",
          "status",
          "nodes",
          "settings",
          "updatedAt",
          "createdAt",
          "id",
        ]);

        // Add custom frontmatter fields from page
        if (page.frontmatter) {
          for (const [key, value] of Object.entries(page.frontmatter)) {
            if (!internalKeys.has(key)) {
              frontmatter.push({
                key,
                value,
                type: getValueType(value),
              });
            }
          }
        }

        const blockCount = page.nodes ? countNodes(page.nodes) : 0;

        const duration = endPerformanceTracking(operation);
        log("debug", `Page meta loaded: ${slug}`, {
          duration: `${duration}ms`,
        });

        return {
          success: true,
          data: {
            slug: page.slug,
            title: page.title ?? page.slug,
            path: `/${page.slug === "index" ? "" : page.slug}`,
            status: page.status ?? "draft",
            layout: layoutInfo,
            seo,
            frontmatter,
            updatedAt: page.updatedAt,
            createdAt: page.createdAt,
            blockCount,
          },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        log("error", "Failed to get page meta", { slug, error });
        return {
          success: false,
          error: {
            code: "GET_PAGE_META_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to get page metadata",
          },
        };
      }
    },
  }),

  /**
   * Update page SEO metadata
   *
   * Updates SEO fields for a specific page. Supports partial updates.
   *
   * @param slug - Page slug/identifier
   * @param seo - SEO fields to update
   * @returns Updated SEO data
   */
  updateSeo: defineAction({
    accept: "json",
    input: z.object({
      slug: z.string().min(1, "Page slug is required"),
      seo: SeoSchema,
    }),
    handler: async ({ slug, seo }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "pages.updateSeo",
        "save-page",
      );

      const operation = `updatePageSeo:${slug}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(slug);

        if (!page) {
          endPerformanceTracking(operation);
          return {
            success: false,
            error: {
              code: ERROR_CODES.PAGE_NOT_FOUND,
              message: `Page not found: ${slug}`,
            },
          };
        }

        const updatedPage: PageDSL = {
          ...page,
          settings: {
            ...page.settings,
            seo: {
              ...page.settings?.seo,
              ...seo,
            },
          },
          updatedAt: new Date().toISOString(),
        };

        await persistPageDraft(adapter, context, updatedPage, authorship, {
          activityAction: "seo_updated",
        });

        const duration = endPerformanceTracking(operation);
        log("info", "Page SEO updated", { slug, duration: `${duration}ms` });

        return {
          success: true,
          data: {
            slug,
            seo: updatedPage.settings?.seo,
          },
        };
      } catch (error) {
        endPerformanceTracking(operation);
        log("error", "Failed to update page SEO", { slug, error });
        return {
          success: false,
          error: {
            code: ERROR_CODES.UPDATE_FAILED,
            message:
              error instanceof Error
                ? error.message
                : "Failed to update page SEO",
          },
        };
      }
    },
  }),

  /**
   * Bulk update page hierarchy
   *
   * Updates order and parent for multiple pages at once.
   * Used for reorganizing page structure in sidebar.
   *
   * @param pages - Array of page updates with slug, parent, and order
   * @returns Count of updated pages
   */
  bulkUpdate: defineAction({
    accept: "json",
    input: z.object({
      pages: z.array(
        z.object({
          slug: z.string().min(1),
          parent: z.string().optional(),
          order: z.number().optional(),
        }),
      ),
    }),
    handler: async ({ pages: pageUpdates }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "pages.bulkUpdate",
        "save-page",
      );

      const operation = "bulkUpdatePages";
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);

        // Process updates in parallel
        const updates = pageUpdates.map(async (pageUpdate) => {
          const existingPage = await adapter.getPageDSL(pageUpdate.slug);
          if (existingPage) {
            const updatedPage: PageDSL = {
              ...existingPage,
              order: pageUpdate.order ?? existingPage.order,
              parent: pageUpdate.parent ?? existingPage.parent,
              updatedAt: new Date().toISOString(),
            };
            await persistPageDraft(adapter, context, updatedPage, authorship, {
              activityAction: "page_updated",
            });
            return true;
          }
          return false;
        });

        const results = await Promise.all(updates);
        const updated = results.filter(Boolean).length;

        const duration = endPerformanceTracking(operation);
        log("info", `Bulk updated ${updated} pages`, {
          duration: `${duration}ms`,
        });

        return { success: true, updated };
      } catch (error) {
        endPerformanceTracking(operation);
        log("error", "Failed to bulk update pages", { error });
        return {
          success: false,
          error: {
            code: "BULK_UPDATE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to bulk update pages",
          },
        };
      }
    },
  }),

  /**
   * Get page activity feed from version history
   *
   * Returns paginated version history with activity metadata for a page.
   * Activity metadata is stored on each version row and records who did what.
   *
   * @param slug - Page slug/identifier
   * @param limit - Number of items to return (max 100, default 20)
   * @param offset - Number of items to skip (default 0)
   * @returns Paginated list of activity items with total count
   */
  getPageActivity: defineAction({
    accept: "json",
    input: GetPageActivityInputSchema,
    handler: async ({ slug, limit, offset }, context) => {
      await requireOperation(context, "pages.getPageActivity");

      const operation = `getPageActivity:${slug}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(slug);

        if (!page) {
          endPerformanceTracking(operation);
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Page not found: ${slug}`,
          });
        }

        const versions = await adapter.getPageVersions(page.id);

        // Sort by version descending (newest first)
        const sorted = [...versions].sort((a, b) =>
          b.version.localeCompare(a.version),
        );

        const authAdapter = await getAuthAdapterAsync(context.locals);
        const avatarLookup = buildUserAvatarLookup(
          await authAdapter.listUsers(),
        );

        const userActivityItems = sorted
          .map((version) => {
            const resolvedActivity =
              resolvePageVersionActivityMetadata(version);
            if (!isUserActivityMetadata(resolvedActivity)) {
              return null;
            }

            const activity = resolvedActivity.userAvatarUrl
              ? resolvedActivity
              : {
                  ...resolvedActivity,
                  userAvatarUrl: resolveActorAvatarUrl(
                    resolvedActivity.userId,
                    resolvedActivity.userAvatarUrl,
                    avatarLookup,
                  ),
                };

            return {
              version: version.version,
              createdAt: version.createdAt,
              activity,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        const total = userActivityItems.length;
        const paged = userActivityItems.slice(offset, offset + limit);

        const output = GetPageActivityOutputSchema.parse({
          items: paged,
          total,
        });

        const duration = endPerformanceTracking(operation);
        log("debug", "Page activity loaded", {
          slug,
          duration: `${duration}ms`,
          total,
          returned: paged.length,
        });

        return output;
      } catch (error) {
        endPerformanceTracking(operation);
        if (error instanceof ActionError) throw error;
        log("error", "Failed to get page activity", { slug, error });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch page activity",
        });
      }
    },
  }),

  /**
   * /** Reorder page sections by updating BuilderNode. metadata.
   */
  reorderSections: defineAction({
    accept: "json",
    input: ReorderSectionsInputSchema,
    handler: async ({ slug, sectionIds }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "pages.reorderSections",
        "save-page",
      );

      const operation = `reorderSections:${slug}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(slug);

        if (!page) {
          endPerformanceTracking(operation);
          return {
            success: false as const,
            error: {
              code: ERROR_CODES.PAGE_NOT_FOUND,
              message: `Page "${slug}" not found`,
            },
          };
        }

        // Build a map of section ID → node for quick lookup
        const nodeMap = new Map(page.nodes.map((n) => [n.id, n]));

        for (const sectionId of sectionIds) {
          if (!nodeMap.has(sectionId)) {
            endPerformanceTracking(operation);
            return {
              success: false as const,
              error: {
                code: ERROR_CODES.SECTION_NOT_FOUND,
                message: `Section "${sectionId}" not found on page`,
              },
            };
          }
        }

        // Update metadata.order for each section based on its new position
        const updatedNodes = page.nodes.map((node) => {
          const newIndex = sectionIds.indexOf(node.id);
          if (newIndex === -1) return node; // Not in reorder list, keep as-is

          return {
            ...node,
            metadata: {
              ...node.metadata,
              order: newIndex,
            },
          };
        });

        // Re-sort nodes based on the new order
        const reorderedNodes = [...updatedNodes].sort((a, b) => {
          const aOrder = a.metadata?.order ?? 0;
          const bOrder = b.metadata?.order ?? 0;
          return aOrder - bOrder;
        });

        const updatedPage: PageDSL = {
          ...page,
          nodes: reorderedNodes,
          updatedAt: new Date().toISOString(),
        };

        const version = await persistPageDraft(
          adapter,
          context,
          updatedPage,
          authorship,
          {
            snapshot: false,
            activityAction: "section_reordered",
          },
        );

        const output = ReorderSectionsOutputSchema.parse({ version });
        const duration = endPerformanceTracking(operation);

        log("info", `Sections reordered on page: ${slug}`, {
          duration: `${duration}ms`,
          sectionCount: sectionIds.length,
        });

        return {
          success: true as const,
          data: output,
        };
      } catch (err) {
        endPerformanceTracking(operation);
        log("error", "Failed to reorder sections", { slug, error: err });
        return {
          success: false as const,
          error: {
            code: ERROR_CODES.SECTION_REORDER_FAILED,
            message:
              err instanceof Error ? err.message : "Failed to reorder sections",
          },
        };
      }
    },
  }),

  /**
   * List all versions for a page
   */
  getVersions: defineAction({
    accept: "json",
    input: GetPageVersionsInputSchema,
    handler: async ({ slug }, context) => {
      await requireOperation(context, "pages.getVersions");
      const operation = `getVersions:${slug}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(slug);

        if (!page) {
          endPerformanceTracking(operation);
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Page "${slug}" not found`,
          });
        }

        const rawVersions = await adapter.getPageVersions(page.id);

        const sorted = [...rawVersions].sort((a, b) =>
          b.version.localeCompare(a.version),
        );

        const displayNumbers = buildVersionDisplayNumbers(sorted);

        const versions = sorted.map((v) => ({
          version: v.version,
          displayVersion: displayNumbers.get(v.version)!,
          createdAt: v.createdAt,
          createdBy: v.createdBy,
          authorName: v.createdBy
            ? formatActorDisplayName(v.createdBy)
            : undefined,
          activity: v.activity ?? null,
        }));

        const pins = await adapter.getPageVersionPins(page.id);
        const protectedVersions = pins
          ? [...collectProtectedPageVersions(pins)]
          : versions.length > 0
            ? [versions[0]!.version]
            : [];

        const output = GetPageVersionsOutputSchema.parse({
          versions,
          protectedVersions,
        });

        const duration = endPerformanceTracking(operation);
        log("debug", "Versions loaded", {
          slug,
          duration: `${duration}ms`,
          count: versions.length,
        });

        return output;
      } catch (err) {
        endPerformanceTracking(operation);
        if (err instanceof ActionError) throw err;
        log("error", "Failed to load versions", { slug, error: err });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Failed to load versions",
        });
      }
    },
  }),

  /**
   * List media assets referenced on a page (page DSL + component instances).
   */
  getPageMedia: defineAction({
    accept: "json",
    input: GetPageMediaInputSchema,
    handler: async ({ slug }, context) => {
      await requireOperation(context, "pages.getPageMedia");
      const operation = `getPageMedia:${slug}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(slug);

        if (!page) {
          endPerformanceTracking(operation);
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Page "${slug}" not found`,
          });
        }

        const catalog = MediaCatalogRepository.tryCreate(context.locals);
        const output = await resolvePageMediaAssets(page, adapter, catalog);

        const duration = endPerformanceTracking(operation);
        log("debug", "Page media loaded", {
          slug,
          duration: `${duration}ms`,
          assets: output.assets.length,
          external: output.external.length,
          missing: output.missing.length,
        });

        return GetPageMediaOutputSchema.parse(output);
      } catch (err) {
        endPerformanceTracking(operation);
        if (err instanceof ActionError) throw err;
        log("error", "Failed to load page media", { slug, error: err });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Failed to load page media",
        });
      }
    },
  }),

  /**
   * Get the full DSL snapshot for a specific version
   */
  getVersionSnapshot: defineAction({
    accept: "json",
    input: GetVersionSnapshotInputSchema,
    handler: async ({ slug, versionId }, context) => {
      await requireOperation(context, "pages.getVersionSnapshot");
      const operation = `getVersionSnapshot:${slug}:${versionId}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(slug);

        if (!page) {
          endPerformanceTracking(operation);
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Page "${slug}" not found`,
          });
        }

        const snapshot = await adapter.getPageDSL(page.id, versionId);

        if (!snapshot) {
          endPerformanceTracking(operation);
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Version "${versionId}" not found for page "${slug}"`,
          });
        }

        const output = GetVersionSnapshotOutputSchema.parse({
          dsl: snapshot as unknown as Record<string, unknown>,
        });

        const duration = endPerformanceTracking(operation);
        log("debug", "Version snapshot loaded", {
          slug,
          version: versionId,
          duration: `${duration}ms`,
        });

        return output;
      } catch (err) {
        endPerformanceTracking(operation);
        if (err instanceof ActionError) throw err;
        log("error", "Failed to load version snapshot", {
          slug,
          version: versionId,
          error: err,
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Failed to load version snapshot",
        });
      }
    },
  }),

  /**
   * Revert page to a specific version
   */
  revertVersion: defineAction({
    accept: "json",
    input: RevertVersionInputSchema,
    handler: async ({ slug, versionId }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "pages.revertVersion",
        "save-page",
      );
      const operation = `revertVersion:${slug}:${versionId}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(slug);

        if (!page) {
          endPerformanceTracking(operation);
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Page "${slug}" not found`,
          });
        }

        const snapshot = await adapter.getPageDSL(page.id, versionId);

        if (!snapshot) {
          endPerformanceTracking(operation);
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Version "${versionId}" not found for page "${slug}"`,
          });
        }

        const newVersion = await persistPageDraft(
          adapter,
          context,
          snapshot,
          authorship,
          {
            versionSaveOptions: {
              skipIfContentUnchanged: false,
              preserveVersion: false,
            },
            invalidateCache: true,
            activityAction: "reverted",
          },
        );

        const output = RevertVersionOutputSchema.parse({ version: newVersion });

        const duration = endPerformanceTracking(operation);
        log("info", "Page reverted", {
          slug,
          fromVersion: versionId,
          newVersion,
          duration: `${duration}ms`,
        });

        return output;
      } catch (err) {
        endPerformanceTracking(operation);
        if (err instanceof ActionError) throw err;
        log("error", "Failed to revert version", {
          slug,
          version: versionId,
          error: err,
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Failed to revert version",
        });
      }
    },
  }),

  /**
   * Permanently delete a historical page version (not undoable).
   */
  deleteVersion: defineAction({
    accept: "json",
    input: DeleteVersionInputSchema,
    handler: async ({ slug, versionId }, context) => {
      await requireOperation(context, "pages.deleteVersion");

      const operation = `deleteVersion:${slug}:${versionId}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(slug);

        if (!page) {
          endPerformanceTracking(operation);
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Page "${slug}" not found`,
          });
        }

        await adapter.deletePageVersion(page.id, versionId);

        await invalidateComposeCache(
          context,
          "page",
          page.slug ?? page.id,
          undefined,
          "crud",
        );

        const output = DeleteVersionOutputSchema.parse({ success: true });

        const duration = endPerformanceTracking(operation);
        log("info", "Page version deleted", {
          slug,
          version: versionId,
          duration: `${duration}ms`,
        });

        return output;
      } catch (err) {
        endPerformanceTracking(operation);
        if (err instanceof ActionError) throw err;
        log("error", "Failed to delete page version", {
          slug,
          version: versionId,
          error: err,
        });
        throw new ActionError({
          code: "BAD_REQUEST",
          message:
            err instanceof Error ? err.message : "Failed to delete version",
        });
      }
    },
  }),

  /**
   * Update a page's cover image
   */
  cover: defineAction({
    accept: "json",
    input: UpdateCoverImageInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "pages.cover",
        "save-page",
      );
      const operation = `cover:${input.pageSlug}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(input.pageSlug);

        if (!page) {
          endPerformanceTracking(operation);
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Page not found",
          });
        }

        page.featuredImage = {
          src: input.src,
          alt: input.alt || undefined,
          caption: input.caption || undefined,
        };

        // Auto-set OG image if enabled and not already set
        let ogImageUpdated = false;
        if (input.autoSetOgImage) {
          page.settings = page.settings || {};
          page.settings.seo = page.settings.seo || {};
          if (!page.settings.seo.ogImage) {
            page.settings.seo.ogImage = input.src;
            ogImageUpdated = true;
          }
        }

        await persistPageDraft(adapter, context, page, authorship, {
          activityAction: "settings_updated",
          activityTarget: "cover image",
        });

        const output = UpdateCoverImageOutputSchema.parse({
          success: true,
          featuredImage: page.featuredImage,
          ogImageUpdated,
        });

        const duration = endPerformanceTracking(operation);
        log("info", "Cover image updated", {
          slug: input.pageSlug,
          src: input.src,
          ogImageUpdated,
          duration: `${duration}ms`,
        });

        return output;
      } catch (err) {
        endPerformanceTracking(operation);
        if (err instanceof ActionError) throw err;
        log("error", "Failed to update cover image", {
          slug: input.pageSlug,
          error: err,
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update cover image",
        });
      }
    },
  }),

  /**
   * Remove a page's cover image
   */
  removeCover: defineAction({
    accept: "json",
    input: RemoveCoverImageInputSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "pages.removeCover",
        "save-page",
      );
      const operation = `removeCover:${input.pageSlug}`;
      startPerformanceTracking(operation);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const page = await adapter.getPageDSL(input.pageSlug);

        if (!page) {
          endPerformanceTracking(operation);
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Page not found",
          });
        }

        const removedSrc = page.featuredImage?.src;
        delete page.featuredImage;

        // Clear OG image if it was set from cover
        let ogImageCleared = false;
        if (input.clearOgImage && page.settings?.seo?.ogImage === removedSrc) {
          const seo = page.settings?.seo;
          if (seo) {
            delete seo.ogImage;
            ogImageCleared = true;
          }
        }

        await persistPageDraft(adapter, context, page, authorship, {
          activityAction: "settings_updated",
          activityTarget: "cover image",
        });

        const output = RemoveCoverImageOutputSchema.parse({
          success: true,
        });

        const duration = endPerformanceTracking(operation);
        log("info", "Cover image removed", {
          slug: input.pageSlug,
          ogImageCleared,
          duration: `${duration}ms`,
        });

        return output;
      } catch (err) {
        endPerformanceTracking(operation);
        if (err instanceof ActionError) throw err;
        log("error", "Failed to remove cover image", {
          slug: input.pageSlug,
          error: err,
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to remove cover image",
        });
      }
    },
  }),
};
