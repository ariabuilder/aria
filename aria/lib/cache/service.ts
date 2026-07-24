import { z } from "zod";
import { getCloudflareEnv, type RuntimeLocals } from "../cloudflare/env";
import { log as baseLog } from "../utils/logger";
import type { PageDSL } from "../types/nodes";

export type ResourceType = "page" | "layout" | "component";
const CACHE_NAMESPACE = "aria:v1";
export type InvalidationSource =
  | "save"
  | "publishing"
  | "manual"
  | "dependency"
  | "crud"
  | "unknown";

export interface CacheStats {
  hits: number;
  misses: number;
  invalidations: number;
  errors: number;
  total: number;
  hitRate: string;
}

export interface CacheConfig {
  composeTTL: number;
  nonceTTL: number;
  enabled: boolean;
}

export interface ComposeCacheReadResult<T> {
  status: "fresh" | "miss";
  data: T | null;
  ageSeconds: number;
}

export interface CacheObservability {
  composeByType: Record<ResourceType, { hits: number; misses: number }>;
  invalidationsBySource: Record<InvalidationSource, number>;
  delivery: {
    ssrServed: number;
  };
  nonce: {
    checks: number;
    failures: number;
    failureRate: string;
  };
}

export interface NonceValidation {
  valid: boolean;
  error?: string;
}

export interface CacheLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CacheContext {
  locals?: RuntimeLocals;
}

type PublicPageIdentity = Pick<PageDSL, "id" | "slug"> & {
  /** Present only for an immutable non-default page publication. */
  locale?: string;
  version?: string;
  pathnameKey?: string;
};

type CloudflareCachePurgeRequest = { tags: string[] } | { files: string[] };

type CloudflareCachePurgeResponse = {
  success: boolean;
  errors?: Array<{ message?: string; code?: number }>;
};

const PUBLIC_PAGE_CACHE_TAG = "aria-public-pages" as const;

const noncePayloadSchema = z.object({
  resourceId: z.string().min(1),
  createdAt: z.int().nonnegative(),
});

const composeCacheEnvelopeSchema = z.object({
  cachedAt: z.int().nonnegative(),
  payload: z.unknown(),
});

const cacheStats: Omit<CacheStats, "total" | "hitRate"> = {
  hits: 0,
  misses: 0,
  invalidations: 0,
  errors: 0,
};

const cacheObservability: CacheObservability = {
  composeByType: {
    page: { hits: 0, misses: 0 },
    layout: { hits: 0, misses: 0 },
    component: { hits: 0, misses: 0 },
  },
  invalidationsBySource: {
    save: 0,
    publishing: 0,
    manual: 0,
    dependency: 0,
    crud: 0,
    unknown: 0,
  },
  delivery: {
    ssrServed: 0,
  },
  nonce: {
    checks: 0,
    failures: 0,
    failureRate: "0.00%",
  },
};

export const CACHE_CONFIG: CacheConfig = {
  composeTTL: 300,
  nonceTTL: 300,
  enabled: true,
};

function log(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  context?: Record<string, unknown>,
): void {
  const prefix = `[Aria Cache][${level.toUpperCase()}]`;
  baseLog(level, `${prefix} ${message}`, context);
}

function parseComposeTypeFromCacheKey(cacheKey: string): ResourceType | null {
  const match = cacheKey.match(/:compose:(page|layout|component):/);
  if (!match || match.length < 2) {
    return null;
  }

  const resourceType = match[1];
  return resourceType === "page" ||
    resourceType === "layout" ||
    resourceType === "component"
    ? resourceType
    : null;
}

function refreshDerivedObservabilityMetrics(): void {
  const nonceFailureRate =
    cacheObservability.nonce.checks > 0
      ? (cacheObservability.nonce.failures / cacheObservability.nonce.checks) *
        100
      : 0;

  cacheObservability.nonce.failureRate = `${nonceFailureRate.toFixed(2)}%`;
}

export function sanitizeCachePart(value: string): string {
  return value
    .replace(/[<>'"&]/g, "")
    .replace(/\.\./g, "")
    .trim();
}

function sanitizeCacheTagPart(value: string): string {
  return sanitizeCachePart(value).replace(/[^A-Za-z0-9:_-]/g, "-");
}

export function getAllPublicPagesCacheTag(): string {
  return PUBLIC_PAGE_CACHE_TAG;
}

export function getPublicPageCacheTags(page: PublicPageIdentity): string[] {
  const tags = new Set<string>([PUBLIC_PAGE_CACHE_TAG]);
  const safeId = sanitizeCacheTagPart(page.id);
  const safeSlug = sanitizeCacheTagPart(page.slug);

  if (safeId.length > 0) {
    tags.add(`aria-page-id:${safeId}`);
  }

  if (safeSlug.length > 0) {
    tags.add(`aria-page-slug:${safeSlug}`);
  }

  const safeLocale = page.locale ? sanitizeCacheTagPart(page.locale) : "";
  const safeVersion = page.version ? sanitizeCacheTagPart(page.version) : "";
  const safePathnameKey = page.pathnameKey
    ? sanitizeCacheTagPart(page.pathnameKey)
    : "";
  if (safeId.length > 0 && safeLocale.length > 0) {
    tags.add(`aria-page-locale:${safeId}:${safeLocale}`);
  }
  if (safeId.length > 0 && safeLocale.length > 0 && safeVersion.length > 0) {
    tags.add(`aria-page-locale-version:${safeId}:${safeLocale}:${safeVersion}`);
  }
  if (safeLocale.length > 0 && safePathnameKey.length > 0) {
    tags.add(`aria-page-locale-route:${safeLocale}:${safePathnameKey}`);
  }

  return [...tags];
}

export function getPublicLayoutCacheTag(layoutId: string): string {
  return `aria-layout-id:${sanitizeCacheTagPart(layoutId)}`;
}

/** Purges an explicit bounded set of public cache tags. */
export async function purgePublicCacheTags(
  context: CacheContext,
  tags: readonly string[],
): Promise<boolean> {
  const unique = [...new Set(tags.filter(Boolean))];
  if (unique.length === 0) return true;
  try {
    return await purgeCloudflareCache(context, { tags: unique });
  } catch (error) {
    cacheStats.errors++;
    log("warn", "Targeted public cache purge failed", {
      tags: unique,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function purgeCloudflareCache(
  context: CacheContext,
  payload: CloudflareCachePurgeRequest,
): Promise<boolean> {
  const env = getCloudflareEnv(context.locals);
  const apiToken =
    typeof env.CLOUDFLARE_API_TOKEN === "string"
      ? env.CLOUDFLARE_API_TOKEN
      : typeof env.CF_API_TOKEN === "string"
        ? env.CF_API_TOKEN
        : undefined;
  const zoneId =
    typeof env.CLOUDFLARE_ZONE_ID === "string"
      ? env.CLOUDFLARE_ZONE_ID
      : typeof env.CF_ZONE_ID === "string"
        ? env.CF_ZONE_ID
        : undefined;

  if (!apiToken || !zoneId) {
    return false;
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(`Cloudflare purge request failed with ${response.status}`);
  }

  const result = (await response.json()) as CloudflareCachePurgeResponse;
  if (!result.success) {
    const detail = result.errors
      ?.map((error) => error.message ?? String(error.code))
      .join(", ");
    throw new Error(detail || "Cloudflare cache purge failed");
  }

  return true;
}

export async function purgePublicPageCache(
  context: CacheContext,
  page: PublicPageIdentity,
): Promise<boolean> {
  try {
    return await purgeCloudflareCache(context, {
      tags: getPublicPageCacheTags(page),
    });
  } catch (error) {
    cacheStats.errors++;
    log("warn", `Public page cache purge failed for ${page.id}`, {
      slug: page.slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function purgeAllPublicPageCache(
  context: CacheContext,
  reason: string,
): Promise<boolean> {
  try {
    return await purgeCloudflareCache(context, {
      tags: [PUBLIC_PAGE_CACHE_TAG],
    });
  } catch (error) {
    cacheStats.errors++;
    log("warn", `Public page cache purge failed for ${reason}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export function getCacheInstance(context: CacheContext): CacheLike | null {
  const env = getCloudflareEnv(context.locals);
  return (env.aria_cache as CacheLike | undefined) ?? null;
}

export function getComposeCacheKey(
  type: ResourceType,
  id: string,
  version?: string,
): string {
  const safeType = sanitizeCachePart(type);
  const safeId = sanitizeCachePart(id);
  if (!version) {
    return `${CACHE_NAMESPACE}:compose:${safeType}:${safeId}`;
  }
  return `${CACHE_NAMESPACE}:compose:${safeType}:${safeId}:${sanitizeCachePart(version)}`;
}

export async function getComposeCachedValue<T>(
  context: CacheContext,
  type: ResourceType,
  id: string,
  version: string,
): Promise<ComposeCacheReadResult<T>> {
  if (!CACHE_CONFIG.enabled) {
    return { status: "miss", data: null, ageSeconds: 0 };
  }

  try {
    const cache = getCacheInstance(context);
    if (!cache) {
      return { status: "miss", data: null, ageSeconds: 0 };
    }

    const cacheKey = getComposeCacheKey(type, id, version);
    const raw = await cache.get(cacheKey);
    if (!raw) {
      cacheStats.misses++;
      cacheObservability.composeByType[type].misses++;
      return { status: "miss", data: null, ageSeconds: 0 };
    }

    const parsedEnvelope = composeCacheEnvelopeSchema.safeParse(
      JSON.parse(raw),
    );
    if (!parsedEnvelope.success) {
      cacheStats.errors++;
      cacheStats.misses++;
      cacheObservability.composeByType[type].misses++;
      return { status: "miss", data: null, ageSeconds: 0 };
    }

    const ageSeconds = Math.max(
      0,
      Math.floor((Date.now() - parsedEnvelope.data.cachedAt) / 1000),
    );

    if (ageSeconds > CACHE_CONFIG.composeTTL) {
      cacheStats.misses++;
      cacheObservability.composeByType[type].misses++;
      return { status: "miss", data: null, ageSeconds };
    }

    cacheStats.hits++;
    cacheObservability.composeByType[type].hits++;

    return {
      status: "fresh",
      data: parsedEnvelope.data.payload as T,
      ageSeconds,
    };
  } catch (error) {
    cacheStats.errors++;
    log("warn", "Compose cache read failed", {
      type,
      id,
      version,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "miss", data: null, ageSeconds: 0 };
  }
}

export async function setComposeCachedValue<T>(
  context: CacheContext,
  type: ResourceType,
  id: string,
  version: string,
  payload: T,
): Promise<void> {
  if (!CACHE_CONFIG.enabled) return;

  try {
    const cache = getCacheInstance(context);
    if (!cache) return;

    const cacheKey = getComposeCacheKey(type, id, version);
    const envelope = composeCacheEnvelopeSchema.parse({
      cachedAt: Date.now(),
      payload,
    });

    await cache.put(cacheKey, JSON.stringify(envelope), {
      expirationTtl: CACHE_CONFIG.composeTTL,
    });
  } catch (error) {
    cacheStats.errors++;
    log("warn", "Compose cache write failed", {
      type,
      id,
      version,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export { getSnapshotCacheKey } from "./snapshot-keys";

export function getNonceCacheKey(resourceId: string, nonce: string): string {
  return `${CACHE_NAMESPACE}:nonce:${sanitizeCachePart(resourceId)}:${sanitizeCachePart(nonce)}`;
}

export async function syncPageComponentDependencies(
  context: CacheContext,
  pageId: string,
  nodes: unknown,
): Promise<void> {
  // Compose payloads keep component references unexpanded, so a component
  // update cannot make a cached page payload stale. The old KV dependency
  // index wrote on every compose/save without serving a correctness need.
  void context;
  void pageId;
  void nodes;
}

export async function removePageComponentDependencies(
  context: CacheContext,
  pageId: string,
): Promise<void> {
  void context;
  void pageId;
}

export async function getDependentPageIdsForComponent(
  context: CacheContext,
  componentId: string,
): Promise<string[]> {
  void context;
  void componentId;
  return [];
}

export function getCacheStats(): CacheStats {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? (cacheStats.hits / total) * 100 : 0;
  return {
    ...cacheStats,
    total,
    hitRate: `${hitRate.toFixed(2)}%`,
  };
}

export function getCacheObservability(): CacheObservability {
  refreshDerivedObservabilityMetrics();
  return {
    composeByType: {
      page: { ...cacheObservability.composeByType.page },
      layout: { ...cacheObservability.composeByType.layout },
      component: { ...cacheObservability.composeByType.component },
    },
    invalidationsBySource: {
      ...cacheObservability.invalidationsBySource,
    },
    delivery: {
      ...cacheObservability.delivery,
    },
    nonce: {
      ...cacheObservability.nonce,
    },
  };
}

export function resetCacheStats(): void {
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.invalidations = 0;
  cacheStats.errors = 0;

  cacheObservability.composeByType.page.hits = 0;
  cacheObservability.composeByType.page.misses = 0;
  cacheObservability.composeByType.layout.hits = 0;
  cacheObservability.composeByType.layout.misses = 0;
  cacheObservability.composeByType.component.hits = 0;
  cacheObservability.composeByType.component.misses = 0;

  cacheObservability.invalidationsBySource.save = 0;
  cacheObservability.invalidationsBySource.publishing = 0;
  cacheObservability.invalidationsBySource.manual = 0;
  cacheObservability.invalidationsBySource.dependency = 0;
  cacheObservability.invalidationsBySource.crud = 0;
  cacheObservability.invalidationsBySource.unknown = 0;

  cacheObservability.delivery.ssrServed = 0;

  cacheObservability.nonce.checks = 0;
  cacheObservability.nonce.failures = 0;
  cacheObservability.nonce.failureRate = "0.00%";
}

export async function getCachedJson<T>(
  context: CacheContext,
  cacheKey: string,
  schema?: z.ZodType<T>,
): Promise<T | null> {
  if (!CACHE_CONFIG.enabled) return null;

  try {
    const cache = getCacheInstance(context);
    if (!cache) return null;

    const raw = await cache.get(cacheKey);
    const composeType = parseComposeTypeFromCacheKey(cacheKey);
    if (!raw) {
      cacheStats.misses++;
      if (composeType) {
        cacheObservability.composeByType[composeType].misses++;
      }
      return null;
    }

    const parsedJson: unknown = JSON.parse(raw);
    const parsed = schema ? schema.parse(parsedJson) : (parsedJson as T);
    cacheStats.hits++;
    if (composeType) {
      cacheObservability.composeByType[composeType].hits++;
    }
    return parsed;
  } catch (error) {
    cacheStats.errors++;
    log("warn", `Cache read failed for ${cacheKey}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function setCachedJson<T>(
  context: CacheContext,
  cacheKey: string,
  value: T,
  ttl: number = CACHE_CONFIG.composeTTL,
): Promise<void> {
  if (!CACHE_CONFIG.enabled) return;

  try {
    const cache = getCacheInstance(context);
    if (!cache) return;

    await cache.put(cacheKey, JSON.stringify(value), { expirationTtl: ttl });
  } catch (error) {
    cacheStats.errors++;
    log("warn", `Cache write failed for ${cacheKey}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function invalidateComposeCache(
  context: CacheContext,
  type: ResourceType,
  id: string,
  version?: string,
  source: InvalidationSource = "unknown",
): Promise<void> {
  // Compose keys include immutable resource versions. Deleting the unversioned
  // key (which is never read) and the newly-created version key wasted KV
  // delete operations. Entries now age out through their configured TTL.
  void context;
  void type;
  void id;
  void version;
  void source;
}

export function generateNonce(): string {
  return crypto.randomUUID();
}

export async function storeNonce(
  context: CacheContext,
  resourceId: string,
  nonce: string,
): Promise<void> {
  try {
    const cache = getCacheInstance(context);
    if (!cache) return;

    const nonceKey = getNonceCacheKey(resourceId, nonce);
    const payload = noncePayloadSchema.parse({
      resourceId: sanitizeCachePart(resourceId),
      createdAt: Date.now(),
    });

    await cache.put(nonceKey, JSON.stringify(payload), {
      expirationTtl: CACHE_CONFIG.nonceTTL,
    });
  } catch (error) {
    log("warn", "Nonce store failed", {
      error: error instanceof Error ? error.message : String(error),
      resourceId,
    });
  }
}

export async function validateNonce(
  context: CacheContext,
  resourceId: string,
  nonce: string,
  options?: {
    allowWhenCacheUnavailable?: boolean;
    allowWhenValidationErrors?: boolean;
  },
): Promise<NonceValidation> {
  cacheObservability.nonce.checks++;
  const allowWhenCacheUnavailable = options?.allowWhenCacheUnavailable ?? true;
  const allowWhenValidationErrors = options?.allowWhenValidationErrors ?? true;

  try {
    const cache = getCacheInstance(context);
    if (!cache) {
      cacheObservability.nonce.failures++;
      return allowWhenCacheUnavailable
        ? { valid: true }
        : { valid: false, error: "Cache unavailable" };
    }

    const nonceKey = getNonceCacheKey(resourceId, nonce);
    const stored = await cache.get(nonceKey);
    if (!stored) {
      cacheObservability.nonce.failures++;
      return { valid: false, error: "Invalid or expired nonce" };
    }

    const parsed = noncePayloadSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) {
      cacheObservability.nonce.failures++;
      return { valid: false, error: "Invalid nonce payload" };
    }

    if (parsed.data.resourceId !== sanitizeCachePart(resourceId)) {
      cacheObservability.nonce.failures++;
      return { valid: false, error: "Nonce resource ID mismatch" };
    }

    const ageMs = Date.now() - parsed.data.createdAt;
    if (ageMs > CACHE_CONFIG.nonceTTL * 1000) {
      cacheObservability.nonce.failures++;
      return { valid: false, error: "Nonce expired" };
    }

    return { valid: true };
  } catch (error) {
    cacheObservability.nonce.failures++;
    log("warn", "Nonce validation failed", {
      error: error instanceof Error ? error.message : String(error),
      resourceId,
    });

    return allowWhenValidationErrors
      ? { valid: true }
      : { valid: false, error: "Nonce validation failed" };
  }
}

export async function consumeNonce(
  context: CacheContext,
  resourceId: string,
  nonce: string,
): Promise<void> {
  try {
    const cache = getCacheInstance(context);
    if (!cache) {
      return;
    }

    await cache.delete(getNonceCacheKey(resourceId, nonce));
  } catch (error) {
    log("warn", "Nonce consume failed", {
      error: error instanceof Error ? error.message : String(error),
      resourceId,
    });
  }
}

export async function validateAndConsumeNonce(
  context: CacheContext,
  resourceId: string,
  nonce: string,
  options?: {
    allowWhenCacheUnavailable?: boolean;
    allowWhenValidationErrors?: boolean;
  },
): Promise<NonceValidation> {
  const validation = await validateNonce(context, resourceId, nonce, options);

  if (validation.valid) {
    await consumeNonce(context, resourceId, nonce);
  }

  return validation;
}

export function recordSsrServed(): void {
  cacheObservability.delivery.ssrServed++;
  refreshDerivedObservabilityMetrics();
}

export const PublicCollectionEntryCacheTagInputSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    templatePageId: z.string().trim().min(1),
  })
  .strict();

export function getPublicCollectionEntryCacheTags(
  input: z.input<typeof PublicCollectionEntryCacheTagInputSchema>,
): readonly string[] {
  const parsed = PublicCollectionEntryCacheTagInputSchema.parse(input);
  const safeCollectionId = sanitizeCacheTagPart(parsed.collectionId);
  const safeEntryId = sanitizeCacheTagPart(parsed.entryId);
  const safeTemplatePageId = sanitizeCacheTagPart(parsed.templatePageId);

  return [
    PUBLIC_PAGE_CACHE_TAG,
    ...(safeCollectionId.length > 0
      ? [`aria-collection:${safeCollectionId}`]
      : []),
    ...(safeEntryId.length > 0 ? [`aria-entry:${safeEntryId}`] : []),
    ...(safeTemplatePageId.length > 0
      ? [`aria-page-id:${safeTemplatePageId}`]
      : []),
  ];
}

export function getPublicCollectionCacheTag(collectionId: string): string {
  return `aria-collection:${sanitizeCacheTagPart(collectionId)}`;
}

export async function purgePublicCollectionEntryCache(
  context: CacheContext,
  input: z.input<typeof PublicCollectionEntryCacheTagInputSchema>,
): Promise<boolean> {
  try {
    const entryTags = getPublicCollectionEntryCacheTags(input);
    return await purgeCloudflareCache(context, {
      tags: [...entryTags],
    });
  } catch (error) {
    cacheStats.errors++;
    log("warn", "Public collection entry cache purge failed", {
      input,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function purgePublicCollectionCache(
  context: CacheContext,
  collectionId: string,
): Promise<boolean> {
  try {
    const tag = getPublicCollectionCacheTag(collectionId);
    if (!tag.endsWith(":")) {
      return await purgeCloudflareCache(context, { tags: [tag] });
    }
    return false;
  } catch (error) {
    cacheStats.errors++;
    log("warn", "Public collection cache purge failed", {
      collectionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
