import type { StorageAdapter } from "../storage/adapter";
import {
  CACHE_CONFIG,
  getComposeCacheKey,
  getCacheObservability,
  getCacheInstance,
  getCacheStats,
  getCachedJson,
  invalidateComposeCache,
  resetCacheStats,
  setCachedJson,
  type CacheConfig,
  type CacheContext,
  type CacheStats,
  type ResourceType,
} from "./service";

export type { CacheConfig, CacheStats, ResourceType };

export {
  CACHE_CONFIG,
  getCacheStats,
  getCacheObservability,
  resetCacheStats,
  invalidateComposeCache,
};

export async function getFromCache<T>(
  context: CacheContext,
  type: ResourceType,
  id: string,
): Promise<T | null> {
  return getCachedJson<T>(context, getComposeCacheKey(type, id));
}

export async function setInCache<T>(
  context: CacheContext,
  type: ResourceType,
  id: string,
  value: T,
  ttl: number = CACHE_CONFIG.composeTTL,
): Promise<void> {
  await setCachedJson(context, getComposeCacheKey(type, id), value, ttl);
}

export async function clearAllCaches(
  context: CacheContext,
  adapter: StorageAdapter,
): Promise<{ success: boolean; clearedCount: number; message: string }> {
  try {
    const cache = getCacheInstance(context);
    if (!cache) {
      return {
        success: false,
        clearedCount: 0,
        message: "Cache not available",
      };
    }

    const [pages, layouts, components] = await Promise.all([
      adapter.listPagesDSL(),
      adapter.listLayoutsDSL(),
      adapter.listComponentsDSL(),
    ]);

    const invalidations: Array<Promise<void>> = [
      ...pages.map((page) => invalidateComposeCache(context, "page", page.id)),
      ...layouts.map((layout) =>
        invalidateComposeCache(context, "layout", layout.id),
      ),
      ...components.map((component) =>
        invalidateComposeCache(context, "component", component.id),
      ),
    ];

    await Promise.all(invalidations);

    return {
      success: true,
      clearedCount: invalidations.length,
      message: `Cleared ${invalidations.length} cache entries`,
    };
  } catch (error) {
    return {
      success: false,
      clearedCount: 0,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
