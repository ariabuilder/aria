/**
 * Bootstrap actions: init, config, and composition.
 */

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import {
  getStorageAdapterAsync,
  type RuntimeLocals,
} from "../lib/storage/getStorageAdapter";
import type { StorageAdapter } from "../lib/storage/adapter";
import type { BuilderNode } from "../lib/types/nodes";
import { getAuthAdapterAsync } from "../lib/auth";
import { parseUserPreferences } from "../lib/schemas/userPreferences";
import {
  getComposeCachedValue,
  generateNonce,
  getCacheStats,
  getComposeCacheKey,
  setComposeCachedValue,
  storeNonce,
  type ResourceType,
} from "../lib/cache/service";
import { requireAuth } from "./_shared";
import { log as baseLog } from "../lib/utils/logger";
import {
  buildPageSnapshotAdminUrl,
  resolvePagePreviewStage,
} from "../lib/rendering/pageSnapshots";
import { buildPageThumbnailAdminUrlWhenStored } from "../lib/rendering/pageThumbnails";
import {
  buildThumbnailFingerprint,
  buildThumbnailState,
} from "../lib/rendering/thumbnailArtifacts";
import { enrichComponentsWithPreviewUrls } from "../lib/rendering/componentPreviewInventory";
import { getSiteStyleRevision } from "../lib/storage/adapter";

type CollectionType = "pages" | "layouts" | "components";
type LogLevel = "debug" | "info" | "warn" | "error";

interface ActionError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

interface LayoutSlotLike {
  name: string;
  isDefault?: boolean;
  defaultContent?: unknown;
}

async function createDestructivePageNonce(input: {
  context: Parameters<typeof storeNonce>[0];
  itemType: ResourceType;
  resource: { id: string; nodes?: unknown };
}): Promise<string | null> {
  if (
    input.itemType !== "page" ||
    !Array.isArray(input.resource.nodes) ||
    input.resource.nodes.length === 0
  ) {
    return null;
  }

  const nonce = generateNonce();
  await storeNonce(input.context, input.resource.id, nonce);
  return nonce;
}

const ERROR_CODES = {
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  STORAGE_ERROR: "STORAGE_ERROR",
} as const;

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const prefix = `[Aria Core][${level.toUpperCase()}]`;

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

function createError(
  code: string,
  message: string,
  context?: Record<string, unknown>,
): ActionError {
  return { code, message, context };
}

function handleError(error: unknown, operation: string): never {
  if (error instanceof Error) {
    log("error", `${operation} failed`, { error: error.message });
    throw error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message;
    const genericError = new Error(`${operation} failed: ${message}`);
    log("error", genericError.message, {
      error,
    });
    throw genericError;
  }
  const genericError = new Error(`${operation} failed: ${String(error)}`);
  log("error", genericError.message);
  throw genericError;
}

function sanitizeInput(input: string): string {
  return input
    .replace(/[<>'"&]/g, "")
    .replace(/\.\./g, "")
    .trim();
}

function validateSlug(slug: string): boolean {
  const slugRegex = /^[a-zA-Z0-9_-]+$/;
  return slugRegex.test(slug) && slug.length > 0 && slug.length <= 255;
}

function normalizeOptionalSlugLike(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeComponentReferenceNode(node: BuilderNode): BuilderNode {
  const normalizedChildren = Array.isArray(node.children)
    ? node.children.map((child) => normalizeComponentReferenceNode(child))
    : [];

  const normalizedNode: BuilderNode = {
    ...node,
    children: normalizedChildren,
  };

  const nodeType = String(normalizedNode.type || "").toLowerCase();
  const componentId =
    normalizedNode.reference?.masterId ||
    normalizedNode.reference?.id ||
    (typeof normalizedNode.props?.componentId === "string"
      ? normalizedNode.props.componentId
      : undefined);

  if (nodeType === "component" && componentId) {
    normalizedNode.type = "Component";
    normalizedNode.reference = {
      ...(normalizedNode.reference || {}),
      type: "instance",
      masterId: componentId,
    };
  }

  return normalizedNode;
}

function normalizeComponentReferenceTree(nodes: BuilderNode[]): BuilderNode[] {
  return nodes.map((node) => normalizeComponentReferenceNode(node));
}

async function getAdapter(context?: {
  locals?: RuntimeLocals;
}): Promise<StorageAdapter> {
  try {
    return await getStorageAdapterAsync(context?.locals);
  } catch (error) {
    log("error", "Failed to initialize storage adapter", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw createError(
      ERROR_CODES.STORAGE_ERROR,
      "Storage adapter initialization failed",
    );
  }
}

interface DocumentWithNodes {
  id: string;
  slug?: string;
  title?: string;
  name?: string;
  description?: string;
  category?: string;
  status?: string;
  layout?: string;
  nodes: BuilderNode[];
  settings?: Record<string, unknown>;
  frontmatter?: Record<string, unknown>;
  regions?: Record<string, unknown>;
  propSchema?: unknown;
  slots?: unknown[];
  updatedAt?: string;
  [key: string]: unknown;
}

async function getResource<T = DocumentWithNodes>(
  adapter: StorageAdapter,
  collection: CollectionType,
  slug: string,
): Promise<T> {
  let resource: unknown;

  switch (collection) {
    case "pages":
      resource = await adapter.getPageDSL(slug);
      break;
    case "layouts":
      resource = await adapter.getLayoutDSL(slug);
      break;
    case "components":
      resource = await adapter.getComponentDSL(slug);
      break;
  }

  if (!resource) {
    throw createError(
      ERROR_CODES.RESOURCE_NOT_FOUND,
      `${collection.slice(0, -1)} not found: ${slug}`,
    );
  }

  return resource as T;
}

export const core = {
  /**
   * /** Initialize builder - Fetch all pages, layouts, and components This
   * is the initial data load when the builder opens. Returns metadata.
   */
  init: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      const operation = "init";
      startPerformanceTracking(operation);

      try {
        log("info", "Initializing builder");

        const adapter = await getAdapter(context);
        const authAdapter = await getAuthAdapterAsync(context.locals);
        const sessionUser = context.locals.user;
        const userRecord = sessionUser
          ? await authAdapter.getUserById(sessionUser.id)
          : null;

        // Fetch all resources in parallel. `listPagesDSL` now surfaces the
        // page policy summary (system role, access mode, hasPassword) so a
        // separate `listPagePolicySummaries` call is no longer needed.
        const [
          pages,
          layouts,
          components,
          siteSettings,
          storedThumbnailKeys,
          storedComponentThumbnailKeys,
        ] = await Promise.all([
          adapter.listPagesDSL(),
          adapter.listLayoutsDSL(),
          adapter.listComponentsDSL(),
          adapter.getSiteSettings(),
          adapter.listStoredPageThumbnailKeys(),
          adapter.listStoredComponentThumbnailKeys(),
        ]);
        const styleRevision = getSiteStyleRevision(siteSettings);

        const duration = endPerformanceTracking(operation);

        log("info", "Builder initialized", {
          pages: pages?.length || 0,
          layouts: layouts?.length || 0,
          components: components?.length || 0,
          duration: `${duration}ms`,
        });

        return {
          pages: (pages || []).map((page) => ({
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
                styleRevision ?? null,
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
          layouts: layouts || [],
          components: enrichComponentsWithPreviewUrls(
            components || [],
            styleRevision ?? null,
            storedComponentThumbnailKeys,
          ),
          // Already fetched above for styleRevision — return it so the client
          // can hydrate `useAppearance` without a duplicate `settings.get`
          // round-trip on cold boot.
          siteSettings: siteSettings ?? null,
          userPreferences: userRecord
            ? parseUserPreferences(userRecord.preferences)
            : null,
        };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),

  /**
   * /** Compose action - Load page with server-side component expansion
   * This is the "bootstrap" pattern: loads a page/layout/component with all.
   */
  compose: defineAction({
    accept: "json",
    input: z.object({
      pageSlug: z.string().min(1).max(255),
      itemType: z.enum(["page", "layout", "component"]).default("page"),
    }),
    handler: async ({ pageSlug, itemType }, context) => {
      await requireAuth(context);

      const operation = `compose:${itemType}:${pageSlug}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedSlug = sanitizeInput(pageSlug);
        if (!validateSlug(sanitizedSlug)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid slug format: ${pageSlug}`,
          );
        }

        const adapter = await getAdapter(context);

        // Fetch the primary resource first so cache keys are version-aware.
        const collection: CollectionType =
          itemType === "component"
            ? "components"
            : itemType === "layout"
              ? "layouts"
              : "pages";
        const resource = await getResource(adapter, collection, sanitizedSlug);
        const pageVersionPins =
          itemType === "page"
            ? await adapter.getPageVersionPins(resource.id)
            : null;
        const resourceVersion = String(
          pageVersionPins?.draftVersion ??
            pageVersionPins?.currentVersion ??
            resource.version ??
            resource.updatedAt ??
            "unversioned",
        );
        let preloadedLayout: {
          id?: string;
          slug?: string;
          title?: string;
          slots?: LayoutSlotLike[];
          regions?: Record<string, unknown>;
          version?: string;
          updatedAt?: string;
        } | null = null;

        if (itemType === "page" && resource.layout) {
          try {
            const layout = await adapter.getLayoutDSL(resource.layout);
            if (layout) {
              preloadedLayout = {
                id: layout.id,
                slug: layout.slug,
                title: layout.title,
                slots: (layout.slots || []) as LayoutSlotLike[],
                regions: (layout.regions || {}) as Record<string, unknown>,
                version: layout.version,
                updatedAt: layout.updatedAt,
              };
            }
          } catch (error) {
            log(
              "warn",
              `Failed to preload layout for cache key: ${resource.layout}`,
              {
                error: error instanceof Error ? error.message : String(error),
              },
            );
          }
        }

        const layoutVersionToken =
          itemType === "page" && preloadedLayout
            ? String(
                preloadedLayout.version ||
                  preloadedLayout.updatedAt ||
                  "layout-unversioned",
              )
            : "";

        const composedVersion =
          layoutVersionToken.length > 0
            ? `${resourceVersion}:layout:${layoutVersionToken}`
            : resourceVersion;
        const cacheKey = getComposeCacheKey(
          itemType as ResourceType,
          sanitizedSlug,
          composedVersion,
        );

        const buildFreshResponse = async (): Promise<
          Record<string, unknown>
        > => {
          // Keep component references as-is (don't expand server-side)
          let pageBlocks = normalizeComponentReferenceTree(
            (resource.nodes || []) as BuilderNode[],
          );

          log("debug", `Returning ${itemType} WITHOUT server expansion`, {
            nodeCount: pageBlocks.length,
          });

          // Fetch layout metadata if page specifies one
          let layoutData = null;
          let availableLayouts: Array<{
            id: string;
            slug: string;
            title: string;
          }> = [];

          const [layouts] = await Promise.all([
            adapter.listLayoutsDSL(),
            (async () => {
              if (resource.layout) {
                try {
                  const layout =
                    preloadedLayout ??
                    (await adapter.getLayoutDSL(resource.layout));
                  if (layout) {
                    layoutData = {
                    id: layout.id,
                    slug: layout.slug,
                    title: layout.title || layout.slug,
                    version: layout.version,
                    slots: layout.slots || [],
                      regions: layout.regions || {},
                    };
                  }
                } catch (error) {
                  log("warn", `Failed to load layout: ${resource.layout}`, {
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                }
              }
            })(),
          ]);

          availableLayouts = layouts.map((l) => ({
            id: l.id,
            slug: l.slug ?? l.id,
            title: l.title ?? l.slug ?? l.id,
          }));

          const nonce = await createDestructivePageNonce({
            context,
            itemType: itemType as ResourceType,
            resource,
          });

          return {
            pageBlocks,
            originalNodes: pageBlocks,
            pageMetadata:
              itemType === "component"
                ? {
                    id: resource.id,
                    slug: resource.slug || resource.id,
                    name: resource.name || resource.id,
                    version: resource.version || resourceVersion,
                    description: resource.description,
                    category: resource.category,
                    propSchema: resource.propSchema,
                    slots: resource.slots,
                    updatedAt: resource.updatedAt || new Date().toISOString(),
                    settings: resource.settings || {},
                  }
                : {
                    id: resource.id,
                    slug: resource.slug,
                    title: resource.title || resource.slug,
                    description: resource.description,
                    // The JSON snapshot can predate version stamping. The
                    // metadata pointer is canonical for optimistic saves.
                    version: resourceVersion,
                    status: resource.status || "draft",
                    systemRole: resource.systemRole ?? "standard",
                    accessMode: resource.accessMode ?? "public",
                    hasPassword: resource.hasPassword ?? false,
                    updatedAt: resource.updatedAt || new Date().toISOString(),
                    settings: resource.settings || {},
                    frontmatter: resource.frontmatter || {},
                    layout: normalizeOptionalSlugLike(resource.layout),
                  },
            currentLayout: layoutData,
            availableLayouts,
            nonce,
            timestamp: Date.now(),
            processingTime: 0,
          };
        };

        const composeCache = await getComposeCachedValue<
          Record<string, unknown>
        >(context, itemType as ResourceType, sanitizedSlug, composedVersion);

        if (
          composeCache &&
          composeCache.status === "fresh" &&
          composeCache.data
        ) {
          const nonce = await createDestructivePageNonce({
            context,
            itemType: itemType as ResourceType,
            resource,
          });

          log("info", `Cache fresh hit for ${cacheKey}`, {
            hitRate: getCacheStats().hitRate,
            version: composedVersion,
            ageSeconds: composeCache.ageSeconds,
          });

          return {
            ...composeCache.data,
            nonce,
            timestamp: Date.now(),
          };
        }

        const response = await buildFreshResponse();

        const duration = endPerformanceTracking(operation);
        response.processingTime = duration;

        log("info", `Composed ${itemType}: ${sanitizedSlug}`, {
          duration: `${duration}ms`,
          nodeCount: Array.isArray(response.pageBlocks)
            ? response.pageBlocks.length
            : 0,
          cached: false,
        });

        await setComposeCachedValue(
          context,
          itemType as ResourceType,
          sanitizedSlug,
          composedVersion,
          response,
        );

        return response;
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),
};
