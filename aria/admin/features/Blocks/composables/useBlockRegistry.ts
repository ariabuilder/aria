/**
 * Load/cache/search the block and component registry.
 */
import { ref, shallowRef, computed, type Ref } from "vue";
import { actions } from "astro:actions";
import { log } from "@/lib/utils/logger";
import type { ComponentDSL } from "../types";
import { unwrapBlockRegistryComponentsResult } from "./blockRegistryActionResults";

/**
 * Block registry composable return type
 */
interface UseBlockRegistryReturn {
  /** All available components */
  readonly components: Ref<readonly ComponentDSL[]>;
  /** Loading state */
  readonly loading: Ref<boolean>;
  /** Error message if any */
  readonly error: Ref<string | null>;
  /** Refresh the registry from storage */
  readonly refreshComponents: () => Promise<void>;
  /** Search components by query */
  readonly searchComponents: (query: string) => readonly ComponentDSL[];
  /** Get component by slug */
  readonly getComponentBySlug: (slug: string) => ComponentDSL | null;
  /** Check if component exists */
  readonly hasComponent: (slug: string) => boolean;
}

// Global cache shared across all instances
const componentsCache = shallowRef<readonly ComponentDSL[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const lastFetch = ref<number | null>(null);

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Block registry with cache + search
 *
 * @example
 * ```typescript
 * const { components, refreshComponents, searchComponents } = useBlockRegistry();
 *
 * // Refresh from storage
 * await refreshComponents();
 *
 * // Search components
 * const results = searchComponents('hero');
 * ```
 */
export function useBlockRegistry(): UseBlockRegistryReturn {

  /**
   * Check if cache is still valid
   */
  const isCacheValid = (): boolean => {
    if (!lastFetch.value) return false;
    const age = Date.now() - lastFetch.value;
    return age < CACHE_TTL;
  };

  /**
   * Refresh components from storage via Astro actions
   *
   * Uses the init action to fetch all builder data including components.
   * Caches results for 5 minutes to reduce server load.
   */
  const refreshComponents = async (): Promise<void> => {
    // Return cached data if still valid
    if (isCacheValid() && componentsCache.value.length > 0) {
      log("debug", "[useBlockRegistry] Using cached components");
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      log("info", "[useBlockRegistry] Fetching components from storage");

      // Use Astro actions to fetch all builder data
      const result = await actions.init();

      const parsedResult = unwrapBlockRegistryComponentsResult(
        result,
        "Failed to fetch components",
        {
          source: "useBlockRegistry.refreshComponents",
        },
      );
      if (!parsedResult.success) {
        throw new Error(parsedResult.error);
      }

      // Update cache
      componentsCache.value = Object.freeze(parsedResult.data);
      lastFetch.value = Date.now();

      log("info", "[useBlockRegistry] Loaded component inventory", {
        count: parsedResult.data.length,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      error.value = errorMessage;
      log("error", "[useBlockRegistry] Failed to fetch components", {
        error: errorMessage,
      });

      // Keep existing cache on error
      if (componentsCache.value.length === 0) {
        componentsCache.value = [];
      }
    } finally {
      loading.value = false;
    }
  };

  /**
   * Search components by query string
   *
   * Searches in component name, description, category, and tags.
   * Case-insensitive.
   *
   * @param query - Search query
   * @returns Matching components
   */
  const searchComponents = (query: string): readonly ComponentDSL[] => {
    if (!query || query.trim() === "") {
      return componentsCache.value;
    }

    const lowerQuery = query.toLowerCase().trim();

    return componentsCache.value.filter((comp) => {
      // Search in name
      if (comp.name?.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // Search in description
      if (comp.description?.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // Search in category
      if (comp.category?.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // Search in tags
      // Note: ComponentDSL doesn't have tags field currently

      return false;
    });
  };

  /**
   * Get a component by its slug
   *
   * @param slug - Component slug/ID
   * @returns Component if found, null otherwise
   */
  const getComponentBySlug = (slug: string): ComponentDSL | null => {
    return componentsCache.value.find((comp) => comp.id === slug) || null;
  };

  /**
   * Check if a component exists in the registry
   *
   * @param slug - Component slug/ID
   * @returns True if component exists
   */
  const hasComponent = (slug: string): boolean => {
    return componentsCache.value.some((comp) => comp.id === slug);
  };

  /**
   * All available components (readonly)
   */
  const components = computed(() => componentsCache.value);

  return {
    components,
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    refreshComponents,
    searchComponents,
    getComponentBySlug,
    hasComponent,
  };
}
