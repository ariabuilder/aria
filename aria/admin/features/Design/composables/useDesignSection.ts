/**
 * The URL query. Uses bare-key pattern matching ?
 */

import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  isDesignSection,
  type DesignSection,
  DesignParamSchema,
  DESIGN_SECTION_TO_PARAM,
  DESIGN_PARAM_TO_SECTION,
} from "../types";

const STORAGE_KEY = "aria-design-section";

/**
 * Scan `route.query` for a recognised bare DesignParam key.
 * Returns the corresponding DesignSection, or null if none found.
 */
function readFromQuery(query: Record<string, unknown>): DesignSection | null {
  for (const key of Object.keys(query)) {
    const parsed = DesignParamSchema.safeParse(key);
    if (parsed.success) {
      return DESIGN_PARAM_TO_SECTION[parsed.data];
    }
  }
  return null;
}

/**
 * Read the last-used section from localStorage.
 * Returns null if nothing valid is stored.
 */
function readFromStorage(): DesignSection | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  return isDesignSection(stored) ? stored : null;
}

export function useDesignSection() {
  const route = useRoute();
  const router = useRouter();

  /**
   * The active DesignSection derived reactively from the URL.
   * Re-evaluates automatically when route.query changes.
   */
  const currentDesignSection = computed<DesignSection>(() => {
    const fromQuery = readFromQuery(route.query as Record<string, unknown>);
    if (fromQuery) return fromQuery;

    // Removed or invalid deep links should land predictably on Colors instead
    // of restoring another section.
    if (Object.keys(route.query).length > 0) return "colors";

    const fromStorage = readFromStorage();
    if (fromStorage) return fromStorage;

    return "colors";
  });

  /**
   * Programmatically switch to a design sub-section.
   * Updates the URL (bare key) and localStorage.
   */
  function setDesignSection(section: DesignSection): void {
    const param = DESIGN_SECTION_TO_PARAM[section];

    // Build query: strip any existing design keys, add the new bare key
    const nextQuery: Record<string, string | null | undefined> = {};
    const currentQuery = route.query as Record<string, unknown>;

    for (const [key, value] of Object.entries(currentQuery)) {
      if (!(key in DESIGN_PARAM_TO_SECTION)) {
        nextQuery[key] = value as string | undefined;
      }
    }

    nextQuery[param] = null; // bare key — produces ?colors etc.

    router.replace({ query: nextQuery });

    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, section);
    }
  }

  return {
    currentDesignSection,
    setDesignSection,
  };
}
