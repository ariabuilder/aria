/**
 * Shared helpers for Astro actions (auth, cache, validation, errors).
 */

import type { ActionAPIContext } from "astro:actions";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import {
  deliverContentRevisionForAction,
  touchContentRevision,
  touchContentRevisionForAction,
} from "../lib/content-sync/mutations";
import {
  formatPageCmsRoutingDeleteMessage,
  getPageCmsRoutingImpact,
  pageHasCmsRoutingAssignments,
} from "../lib/pages/cmsTemplatePolicy";
import type {
  AuthorshipSaveContext,
  ContentMutationKind,
  StorageAdapter,
} from "../lib/storage/adapter";
import type { OperationId } from "../lib/auth/capabilityOperations";
import { requireOperation } from "../lib/auth";
import type { SessionUser } from "../lib/auth";
import {
  buildAuthorshipSaveContext,
  buildMediaAuthorshipContextFromSession,
  parseAuthorshipSaveContext,
  type MediaAuthorshipMutationKind,
} from "../lib/authorship/stamping";
import type { MediaAssetAuthorshipContext } from "../lib/media/catalog/repository";
import type { VersionSaveOptions } from "../lib/storage/versioning";
import { isStarterLayoutId } from "../lib/storage/starterLayoutIds";
import type { BuilderNode } from "../lib/types/nodes";
import { log as baseLog } from "../lib/utils/logger";
import {
  CACHE_CONFIG as SERVICE_CACHE_CONFIG,
  generateNonce as generateNonceService,
  getCachedJson,
  getCacheInstance as getCacheInstanceService,
  getCacheStats as getCacheStatsService,
  getComposeCacheKey,
  invalidateComposeCache as invalidateComposeCacheService,
  type InvalidationSource,
  resetCacheStats as resetCacheStatsService,
  setCachedJson,
  storeNonce as storeNonceService,
  consumeNonce as consumeNonceService,
  validateNonce as validateNonceService,
  validateAndConsumeNonce as validateAndConsumeNonceService,
} from "../lib/cache/service";
import { deletePageSnapshots } from "../lib/rendering/pageSnapshots";
import { readSessionUserFromLocals } from "../lib/runtime/requestLocals";
import { assertExecutableContentChangeAllowed } from "../lib/security/executableContent";
import { deferWithWaitUntil } from "../lib/cloudflare/waitUntil";

// Re-export auth helpers for use in action modules
export {
  requireAuth,
  requireAdmin,
  requireRole,
  requireCapability,
  requireOperation,
  getAuthUser,
  sessionUserToActorRef,
} from "../lib/auth";
export type { SessionUser, UserRole } from "../lib/auth";
export {
  buildAuthorshipSaveContext,
  buildMediaAuthorshipContextFromSession,
  parseAuthorshipSaveContext,
} from "../lib/authorship/stamping";
export type { MediaAuthorshipMutationKind } from "../lib/authorship/stamping";
export type { MediaAssetAuthorshipContext } from "../lib/media/catalog/repository";
export type {
  AuthorshipSaveContext,
  ContentMutationKind,
} from "../lib/storage/adapter";

/**
 * Resource types managed by the builder
 */
export type ResourceType = "page" | "layout" | "component";

/**
 * Collection names for CRUD operations
 */
export type CollectionType = "pages" | "layouts" | "components";

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Structured error response with context
 */
export interface ActionError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
}

/**
 * Success response wrapper
 */
export interface ActionSuccess<T = unknown> {
  success: true;
  data: T;
  meta?: {
    timestamp: number;
    duration?: number;
  };
}

/**
 * Error response wrapper
 */
export interface ActionFailure {
  success: false;
  error: ActionError;
}

export type ActionResponse<T = unknown> = ActionSuccess<T> | ActionFailure;

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  hits: number;
  misses: number;
  invalidations: number;
  errors: number;
  total: number;
  hitRate: string;
}

export interface CacheConfig {
  composeTTL: number; // TTL for compose cache (seconds)
  nonceTTL: number; // TTL for security nonces (seconds)
  enabled: boolean; // Global cache toggle
}

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  operation: string;
}

export interface NonceValidation {
  valid: boolean;
  error?: string;
}

interface CacheLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ActionContextLike {
  locals?: App.Locals;
  request?: Request;
}

export type SaveResourceOptions = {
  locals?: App.Locals;
  versionSaveOptions?: VersionSaveOptions;
  linkedLayoutDraft?: import("../lib/storage/adapter").LinkedLayoutDraftSave;
};

type DraftSurfaceMutation = {
  mutationKind: "save-page" | "save-layout" | "save-component";
  mutationTarget: string;
};

async function commitDraftRevisionAndScheduleDelivery(
  adapter: StorageAdapter,
  context: ActionContextLike,
  mutation: DraftSurfaceMutation,
  diagnostics: {
    correlationId: string;
    collection: CollectionType;
    resourceId: string;
    version: string;
  },
): Promise<void> {
  let revision: Awaited<ReturnType<typeof touchContentRevision>>;
  try {
    revision = await touchContentRevision(adapter, mutation, context);
  } catch (error) {
    log("warn", "Resource save content revision failed after commit", {
      code: "RESOURCE_SAVE_REVISION_FAILED",
      ...diagnostics,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  log("info", "Resource save content revision committed", {
    code: "RESOURCE_SAVE_REVISION_COMMITTED",
    ...diagnostics,
    revisionSeq: revision.revisionSeq,
  });

  const delivery = deliverContentRevisionForAction(
    revision,
    mutation,
    context,
    { purgePublicPages: false },
  ).catch((error: unknown) => {
    log("warn", "Resource save post-commit delivery failed", {
      code: "RESOURCE_SAVE_DELIVERY_FAILED",
      ...diagnostics,
      revisionSeq: revision.revisionSeq,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  if (!deferWithWaitUntil(context.locals, delivery)) {
    await delivery;
  }
}

/**
 * Gate a mutation by operation ID and build Zod-parsed authorship context.
 */
export async function resolveAuthorizedMutation(
  context: ActionAPIContext,
  operationId: OperationId,
  mutationKind: ContentMutationKind,
): Promise<{ user: SessionUser; authorship: AuthorshipSaveContext }> {
  const user = await requireOperation(context, operationId);
  return {
    user,
    authorship: buildAuthorshipSaveContext(user, mutationKind),
  };
}

/**
 * Gate a media catalog mutation by operation ID and build Zod-parsed authorship context.
 */
export async function resolveAuthorizedMediaMutation(
  context: ActionAPIContext,
  operationId: OperationId,
  mutationKind: MediaAuthorshipMutationKind,
): Promise<{ user: SessionUser; authorship: MediaAssetAuthorshipContext }> {
  const user = await requireOperation(context, operationId);
  return {
    user,
    authorship: buildMediaAuthorshipContextFromSession(user, mutationKind),
  };
}

export type SaveableResource =
  | Parameters<StorageAdapter["savePageDSL"]>[1]
  | Parameters<StorageAdapter["saveLayoutDSL"]>[1]
  | Parameters<StorageAdapter["saveComponentDSL"]>[1];

export interface ComponentReference {
  type: "page" | "layout";
  id: string;
  path: string;
}

/**
 * Cache configuration with sensible defaults
 * TTLs are in seconds to match Cloudflare KV API
 */
export const CACHE_CONFIG: CacheConfig = {
  composeTTL: SERVICE_CACHE_CONFIG.composeTTL,
  nonceTTL: SERVICE_CACHE_CONFIG.nonceTTL,
  enabled: SERVICE_CACHE_CONFIG.enabled,
};

export const ERROR_CODES = {
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  RESOURCE_EXISTS: "RESOURCE_EXISTS",
  RESOURCE_IN_USE: "RESOURCE_IN_USE",
  PROTECTED_RESOURCE: "PROTECTED_RESOURCE",

  INVALID_INPUT: "INVALID_INPUT",
  INVALID_NONCE: "INVALID_NONCE",
  NONCE_EXPIRED: "NONCE_EXPIRED",

  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  STORAGE_ERROR: "STORAGE_ERROR",
  CACHE_ERROR: "CACHE_ERROR",

  INTERNAL_ERROR: "INTERNAL_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  NODE_NOT_FOUND: "NODE_NOT_FOUND",
  INVALID_MOVE: "INVALID_MOVE",
} as const;

const performanceMetrics: Map<string, PerformanceMetrics> = new Map();

/**
 * Structured logger with severity levels and context
 *
 * Structured logs with level + context for debugging.
 */
export function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  const logMessage = context
    ? `${prefix} ${message} ${JSON.stringify(context)}`
    : `${prefix} ${message}`;

  baseLog(level, logMessage, context);
}

/**
 * Create performance tracking for an operation
 *
 * Enables monitoring of action execution time for performance
 * optimization and anomaly detection.
 */
export function startPerformanceTracking(
  operation: string,
): PerformanceMetrics {
  const metrics: PerformanceMetrics = {
    startTime: Date.now(),
    operation,
  };
  performanceMetrics.set(operation, metrics);
  return metrics;
}

/**
 * Complete performance tracking and log results
 */
export function endPerformanceTracking(operation: string): number {
  const metrics = performanceMetrics.get(operation);
  if (!metrics) return 0;

  metrics.endTime = Date.now();
  metrics.duration = metrics.endTime - metrics.startTime;

  log("debug", `Performance: ${operation}`, {
    duration: `${metrics.duration}ms`,
  });

  performanceMetrics.delete(operation);
  return metrics.duration;
}

/**
 * Create structured error response
 *
 * Error payload with codes for client-side
 * error handling and user-friendly messages.
 */
export function createError(
  code: string,
  message: string,
  context?: Record<string, unknown>,
): ActionError {
  const error: ActionError = {
    code,
    message,
    context,
  };

  // Include stack trace in development
  if (import.meta.env.DEV) {
    error.stack = new Error().stack;
  }

  return error;
}

export function isActionError(error: unknown): error is ActionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as ActionError).code === "string" &&
    "message" in error &&
    typeof (error as ActionError).message === "string"
  );
}

export function createSuccess<T>(data: T, duration?: number): ActionSuccess<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: Date.now(),
      ...(duration !== undefined && { duration }),
    },
  };
}

/**
 * Handle and format errors consistently
 *
 * Centralizes error handling logic to prevent information
 * leakage in production while maintaining debugging capability.
 */
export function handleError(error: unknown, operation: string): never {
  if (error instanceof Error) {
    log("error", `${operation} failed`, {
      error: error.message,
      stack: import.meta.env.DEV ? error.stack : undefined,
    });
    throw error;
  }

  const genericError = new Error(`${operation} failed: ${String(error)}`);
  log("error", genericError.message);
  throw genericError;
}

export function isResourceType(value: unknown): value is ResourceType {
  return (
    typeof value === "string" && ["page", "layout", "component"].includes(value)
  );
}

export function isCollectionType(value: unknown): value is CollectionType {
  return (
    typeof value === "string" &&
    ["pages", "layouts", "components"].includes(value)
  );
}

/**
 * Sanitize user input to prevent injection attacks
 *
 * Prevents XSS and injection attacks through user-controlled
 * identifiers and content.
 */
export function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters while preserving valid slugs/IDs
  return input
    .replace(/[<>'"&]/g, "") // Remove HTML/script injection vectors
    .replace(/\.\./g, "") // Prevent directory traversal
    .trim();
}

/**
 * Validate slug format
 *
 * Keep slugs filesystem- and URL-safe to prevent
 * path traversal and routing issues.
 */
export function validateSlug(slug: string): boolean {
  // Allow alphanumeric, hyphens, underscores (filesystem and URL safe)
  const slugRegex = /^[a-zA-Z0-9_-]+$/;
  return slugRegex.test(slug) && slug.length > 0 && slug.length <= 255;
}

/**
 * Get current cache statistics
 *
 * Cache hit/miss stats for monitoring
 * and optimization decisions.
 */
export function getCacheStats(): CacheStats {
  return getCacheStatsService();
}

/**
 * Reset cache statistics (useful for testing/monitoring)
 */
export function resetCacheStats(): void {
  resetCacheStatsService();
  log("info", "Cache statistics reset");
}

/**
 * Generate cache key with consistent format
 *
 * Centralizes cache key generation to ensure consistency
 * and enable easy key pattern changes.
 */
export function generateCacheKey(type: ResourceType, id: string): string {
  return getComposeCacheKey(type, id);
}

/**
 * Get KV cache instance from context
 *
 * Centralizes cache access logic with proper null handling
 * to support both local and Cloudflare environments.
 */
export function getCacheInstance(context: ActionContextLike): CacheLike | null {
  return getCacheInstanceService(context);
}

/**
 * Invalidate compose cache for a specific resource
 *
 * Drop stale cache entries when resources change by removing
 * stale cached data. Gracefully degrades if cache unavailable.
 *
 * @param context - Astro action context with runtime environment
 * @param itemType - Type of resource being invalidated
 * @param id - Unique identifier of the resource
 */
export async function invalidateComposeCache(
  context: ActionContextLike,
  itemType: ResourceType,
  id: string,
  version?: string,
  source: InvalidationSource = "unknown",
): Promise<void> {
  await invalidateComposeCacheService(context, itemType, id, version, source);
}

/**
 * Invalidate cache for all pages that depend on a component or layout
 *
 * When a component/layout changes, all pages using it have stale
 * cached compose results. This ensures cache consistency across the
 * dependency graph.
 *
 * @param context - Astro action context
 * @param resourceType - Type of dependency that changed
 * @param resourceId - ID of the changed dependency
 */
export async function invalidateDependentPageCaches(
  context: ActionContextLike,
  resourceType: "component" | "layout",
  resourceId: string,
): Promise<void> {
  // Compose responses contain references rather than expanded component or
  // layout payloads. Content revisions make render-style keys change, so the
  // dependency graph no longer needs KV records or a page-wide cache sweep.
  void context;
  void resourceType;
  void resourceId;
}

/**
 * Get cached data from Cloudflare KV
 *
 * Centralizes cache retrieval with proper error handling,
 * statistics tracking, and null safety.
 */
export async function getCachedData<T>(
  context: ActionContextLike,
  cacheKey: string,
): Promise<T | null> {
  return getCachedJson<T>(context, cacheKey);
}

/**
 * Set cached data in Cloudflare KV
 *
 * Centralizes cache writing with TTL management and error handling.
 * Failures don't break the application flow.
 */
export async function setCachedData<T>(
  context: ActionContextLike,
  cacheKey: string,
  data: T,
  ttl: number = CACHE_CONFIG.composeTTL,
): Promise<void> {
  await setCachedJson(context, cacheKey, data, ttl);
}

/**
 * Generate cryptographically secure nonce
 *
 * Uses crypto.randomUUID() for better randomness than Math.random(),
 * preventing nonce prediction attacks.
 */
export function generateNonce(): string {
  return generateNonceService();
}

/**
 * Store nonce in KV for later validation
 *
 * Prevents replay attacks by storing nonces with TTL,
 * ensuring one-time use pattern for sensitive operations.
 */
export async function storeNonce(
  context: ActionContextLike,
  resourceId: string,
  nonce: string,
): Promise<void> {
  await storeNonceService(context, sanitizeInput(resourceId), nonce);
}

const COMPOSE_NONCE_VALIDATION_OPTIONS = {
  allowWhenCacheUnavailable: true,
  allowWhenValidationErrors: false,
} as const;

/**
 * Validate compose nonce without consuming it (peek).
 */
export async function validateNonce(
  context: ActionContextLike,
  resourceId: string,
  nonce: string,
): Promise<NonceValidation> {
  return validateNonceService(
    context,
    sanitizeInput(resourceId),
    nonce,
    COMPOSE_NONCE_VALIDATION_OPTIONS,
  );
}

export async function consumeNonce(
  context: ActionContextLike,
  resourceId: string,
  nonce: string,
): Promise<void> {
  await consumeNonceService(context, sanitizeInput(resourceId), nonce);
}

/**
 * Validate and consume nonce (one-time use)
 *
 * Confirm the save request is fresh by consuming
 * the nonce on first use, preventing replay attacks.
 *
 * @param context - Astro action context
 * @param resourceId - ID of resource being modified
 * @param nonce - Nonce to validate
 * @returns Validation result with error details if invalid
 */
export async function validateAndConsumeNonce(
  context: ActionContextLike,
  resourceId: string,
  nonce: string,
): Promise<NonceValidation> {
  return validateAndConsumeNonceService(
    context,
    sanitizeInput(resourceId),
    nonce,
    COMPOSE_NONCE_VALIDATION_OPTIONS,
  );
}

/**
 * Recursively check if a node tree contains a component reference
 *
 * Prevents orphaned references by detecting component usage
 * before allowing deletion.
 *
 * @param nodes - Node tree to search
 * @param componentSlug - Component ID to find
 * @returns True if component is referenced in tree
 */
export function hasComponentReference(
  nodes: BuilderNode[],
  componentSlug: string,
): boolean {
  for (const node of nodes) {
    // Check various component reference formats
    if (node.type === "Component") {
      const matchesMasterId = node.reference?.masterId === componentSlug;
      const matchesId = node.reference?.id === componentSlug;
      const matchesProps = node.props?.componentId === componentSlug;

      if (matchesMasterId || matchesId || matchesProps) {
        return true;
      }
    }

    // Recurse into children
    if (node.children?.length) {
      if (hasComponentReference(node.children, componentSlug)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Find all references to a component across pages and layouts
 *
 * Show where a component is used before deletion,
 * preventing broken references and data integrity issues.
 *
 * @param adapter - Storage adapter instance
 * @param componentSlug - Component to search for
 * @returns Array of reference locations
 */
export async function findComponentReferences(
  adapter: StorageAdapter,
  componentSlug: string,
): Promise<ComponentReference[]> {
  const references: ComponentReference[] = [];
  const operation = `findReferences:${componentSlug}`;
  startPerformanceTracking(operation);

  try {
    // Search pages in parallel with layouts for better performance
    const [pages, layouts] = await Promise.all([
      adapter.listPagesDSL(),
      adapter.listLayoutsDSL(),
    ]);

    // Check pages — load full DSL for each to scan component references
    for (const page of pages) {
      const pageDSL = await adapter.getPageDSL(page.id);
      if (
        pageDSL?.nodes &&
        hasComponentReference(pageDSL.nodes, componentSlug)
      ) {
        references.push({
          type: "page",
          id: page.id,
          path: `page:${page.id}`,
        });
      }
    }

    for (const layout of layouts) {
      if (layout.nodes && hasComponentReference(layout.nodes, componentSlug)) {
        references.push({
          type: "layout",
          id: layout.id,
          path: `layout:${layout.id}`,
        });
      }
    }

    log("debug", `Found ${references.length} references to ${componentSlug}`);
  } catch (error) {
    log("error", "Error finding component references", {
      componentSlug,
      error: error instanceof Error ? error.message : String(error),
    });
    // Return empty array to allow deletion to proceed if check fails
    // This is safer than blocking operations when we can't verify
  } finally {
    endPerformanceTracking(operation);
  }

  return references;
}

/**
 * Get storage adapter with error handling
 *
 * Centralizes adapter initialization with proper error context
 * for debugging storage-related issues.
 */
export async function getAdapter(
  context?: ActionContextLike,
): Promise<StorageAdapter> {
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

/**
 * Get resource from storage with unified error handling
 *
 * Eliminates code duplication across actions by providing
 * a single point for resource retrieval with proper error handling.
 */
export async function getResource<T = unknown>(
  adapter: StorageAdapter,
  collection: CollectionType,
  slug: string,
): Promise<T> {
  try {
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

    const nodeCount =
      typeof resource === "object" &&
      resource !== null &&
      "nodes" in resource &&
      Array.isArray((resource as { nodes?: unknown }).nodes)
        ? (resource as { nodes: unknown[] }).nodes.length
        : 0;

    log("debug", `Retrieved ${collection.slice(0, -1)}: ${slug}`, {
      nodeCount,
    });

    return resource as T;
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      throw error; // Re-throw structured errors
    }
    throw createError(
      ERROR_CODES.STORAGE_ERROR,
      `Failed to retrieve ${collection.slice(0, -1)}: ${slug}`,
      { originalError: String(error) },
    );
  }
}

/**
 * Save resource to storage with unified error handling
 *
 * Shared save path with cache invalidation
 * and dependency tracking across all resource types.
 */
export async function saveResource(
  adapter: StorageAdapter,
  context: ActionContextLike,
  collection: CollectionType,
  slug: string,
  data: SaveableResource,
  authorship: AuthorshipSaveContext,
  saveOptions?: SaveResourceOptions,
): Promise<string> {
  const correlationId = crypto.randomUUID();
  const saveStartedAt = performance.now();
  const parsedAuthorship = parseAuthorshipSaveContext(authorship);
  const versionOptions = saveOptions?.versionSaveOptions;

  const nextNodes =
    "nodes" in data && Array.isArray(data.nodes)
      ? (data.nodes as BuilderNode[])
      : [];
  const nextHeadHtml =
    "settings" in data && data.settings && typeof data.settings === "object"
      ? (data.settings as { headHTML?: unknown }).headHTML
      : undefined;
  const hasPotentialExecutableContent =
    nextNodes.some(function walk(node): boolean {
      const props = node.props ?? {};
      return (
        (node.type.toLowerCase() === "code" && props.renderMode === "render") ||
        (node.type.toLowerCase() === "svg" &&
          typeof props.content === "string") ||
        (node.children ?? []).some(walk)
      );
    }) ||
    (typeof nextHeadHtml === "string" && nextHeadHtml.trim().length > 0);

  if (hasPotentialExecutableContent) {
    const previous =
      collection === "pages"
        ? await adapter.getPageDSL(slug)
        : collection === "layouts"
          ? await adapter.getLayoutDSL(slug)
          : await adapter.getComponentDSL(slug);
    assertExecutableContentChangeAllowed({
      user: context.locals ? readSessionUserFromLocals(context.locals) : null,
      previousNodes: previous?.nodes,
      nextNodes,
      previousHeadHtml:
        previous && "settings" in previous
          ? (previous.settings as { headHTML?: unknown } | undefined)?.headHTML
          : undefined,
      nextHeadHtml,
    });
  }

  try {
    let version: string;

    switch (collection) {
      case "pages":
        version = await adapter.savePageDSL(
          slug,
          data as Parameters<StorageAdapter["savePageDSL"]>[1],
          {
            ...versionOptions,
            ...(saveOptions?.linkedLayoutDraft
              ? { linkedLayoutDraft: saveOptions.linkedLayoutDraft }
              : {}),
          },
          parsedAuthorship,
        );
        await commitDraftRevisionAndScheduleDelivery(
          adapter,
          context,
          { mutationKind: "save-page", mutationTarget: slug },
          { correlationId, collection, resourceId: slug, version },
        );
        if (saveOptions?.linkedLayoutDraft) {
          await commitDraftRevisionAndScheduleDelivery(
            adapter,
            context,
            {
              mutationKind: "save-layout",
              mutationTarget: saveOptions.linkedLayoutDraft.id,
            },
            {
              correlationId,
              collection,
              resourceId: saveOptions.linkedLayoutDraft.id,
              version,
            },
          );
        }
        break;
      case "layouts":
        version = await adapter.saveLayoutDSL(
          slug,
          data as Parameters<StorageAdapter["saveLayoutDSL"]>[1],
          versionOptions,
          parsedAuthorship,
        );
        await commitDraftRevisionAndScheduleDelivery(
          adapter,
          context,
          { mutationKind: "save-layout", mutationTarget: slug },
          { correlationId, collection, resourceId: slug, version },
        );
        break;
      case "components":
        version = await adapter.saveComponentDSL(
          slug,
          data as Parameters<StorageAdapter["saveComponentDSL"]>[1],
          versionOptions,
          parsedAuthorship,
        );
        await commitDraftRevisionAndScheduleDelivery(
          adapter,
          context,
          { mutationKind: "save-component", mutationTarget: slug },
          { correlationId, collection, resourceId: slug, version },
        );
        break;
      default:
        throw createError(
          ERROR_CODES.INVALID_INPUT,
          `Invalid collection: ${collection}`,
        );
    }

    log("info", `Saved ${collection.slice(0, -1)}: ${slug}`, {
      code: "RESOURCE_SAVE_COMMITTED",
      correlationId,
      version,
      durationMs: Math.round(performance.now() - saveStartedAt),
    });

    return version;
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      throw error; // Re-throw structured errors
    }
    throw createError(
      ERROR_CODES.STORAGE_ERROR,
      `Failed to save ${collection.slice(0, -1)}: ${slug}`,
      { originalError: String(error) },
    );
  }
}

/**
 * Delete resource from storage with validation
 *
 * Block delete when component references still exist
 * before removal to prevent orphaned data.
 */
export async function deleteResource(
  adapter: StorageAdapter,
  context: ActionContextLike,
  collection: CollectionType,
  slug: string,
): Promise<void> {
  try {
    // For components, check for references before deletion
    if (collection === "components") {
      const references = await findComponentReferences(adapter, slug);
      if (references.length > 0) {
        const paths = references.map((ref) => ref.path).join(", ");
        throw createError(
          ERROR_CODES.RESOURCE_IN_USE,
          `Cannot delete component "${slug}" - it is used in ${references.length} location(s): ${paths}`,
          { references },
        );
      }
    }

    switch (collection) {
      case "pages":
        const existingPage = await adapter.getPageDSL(slug);
        const pageId = existingPage?.id ?? slug;
        const pageSlug = existingPage?.slug ?? slug;
        const collections = await adapter.listCollections();
        const routingImpact = getPageCmsRoutingImpact({
          pageId,
          pageSlug,
          collections,
        });
        if (pageHasCmsRoutingAssignments(routingImpact)) {
          throw createError(
            ERROR_CODES.RESOURCE_IN_USE,
            formatPageCmsRoutingDeleteMessage(routingImpact),
            { routingImpact },
          );
        }
        await adapter.deletePageDSL(slug);
        await deletePageSnapshots(pageSlug, adapter);
        await adapter.deletePageThumbnail(pageId);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "delete-page",
            mutationTarget: pageId,
          },
          context,
        );
        await invalidateComposeCache(
          context,
          "page",
          pageSlug,
          undefined,
          "crud",
        );
        break;
      case "layouts":
        if (isStarterLayoutId(slug)) {
          throw createError(
            ERROR_CODES.PROTECTED_RESOURCE,
            `"${slug}" is a built-in starter layout and can't be deleted.`,
            { layoutId: slug },
          );
        }
        await adapter.deleteLayoutDSL(slug);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "delete-layout",
            mutationTarget: slug,
          },
          context,
        );
        await invalidateComposeCache(
          context,
          "layout",
          slug,
          undefined,
          "crud",
        );
        await invalidateDependentPageCaches(context, "layout", slug);
        break;
      case "components":
        await adapter.deleteComponentDSL(slug);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "delete-component",
            mutationTarget: slug,
          },
          context,
        );
        await invalidateComposeCache(
          context,
          "component",
          slug,
          undefined,
          "crud",
        );
        await invalidateDependentPageCaches(context, "component", slug);
        break;
    }

    log("info", `Deleted ${collection.slice(0, -1)}: ${slug}`);
  } catch (error) {
    if (isActionError(error)) {
      throw error;
    }
    if (error instanceof Error && "code" in error) {
      throw error; // Re-throw structured errors
    }
    throw createError(
      ERROR_CODES.STORAGE_ERROR,
      `Failed to delete ${collection.slice(0, -1)}: ${slug}`,
      { originalError: String(error) },
    );
  }
}
