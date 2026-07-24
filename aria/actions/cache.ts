/**
 * Astro actions for cache monitoring, statistics, and administrative cache operations.
 */

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import {
  getCacheObservability,
  getCacheStats as getStats,
  resetCacheStats as resetStats,
  clearAllCaches as clearAll,
  invalidateComposeCache,
} from "../lib/cache";
import { requireAuth } from "./_shared";

export const cache = {
  /**
   * Get current cache statistics
   *
   * Returns hit/miss counts, invalidation stats, and hit rate
   * for monitoring cache performance.
   *
   * @returns Cache statistics object
   */
  getStats: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      return getStats();
    },
  }),

  /**
   * Get detailed cache observability metrics
   */
  getObservability: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);
      return getCacheObservability();
    },
  }),

  /**
   * Reset cache statistics
   *
   * Clears all statistics counters back to zero.
   * Useful for starting fresh monitoring periods.
   *
   * @returns Success confirmation
   */
  resetStats: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);

      resetStats();
      return { success: true, message: "Cache stats reset" };
    },
  }),

  /**
   * Clear all compose caches
   *
   * Removes all cached compose results for pages, layouts,
   * and components. Requires explicit confirmation.
   *
   * @param confirm - Must be true to proceed
   * @returns Result with count of cleared entries
   */
  clearAll: defineAction({
    accept: "json",
    input: z.object({
      confirm: z.boolean(),
    }),
    handler: async ({ confirm }, context) => {
      await requireAuth(context);

      if (!confirm) {
        return {
          success: false,
          clearedCount: 0,
          message: "Must confirm cache clear operation",
        };
      }

      const adapter = await getStorageAdapterAsync(context.locals);
      return clearAll(context, adapter);
    },
  }),

  /**
   * Invalidate cache for a specific resource
   *
   * Removes the cached compose result for a single page,
   * layout, or component.
   *
   * @param type - Resource type (page, layout, component)
   * @param id - Resource identifier
   * @returns Success confirmation
   */
  invalidate: defineAction({
    accept: "json",
    input: z.object({
      type: z.enum(["page", "layout", "component"]),
      id: z.string().min(1),
    }),
    handler: async ({ type, id }, context) => {
      await requireAuth(context);

      await invalidateComposeCache(context, type, id, undefined, "manual");

      return {
        success: true,
        message: `Cache invalidated for ${type}:${id}`,
      };
    },
  }),
};
