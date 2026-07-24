import { useSeoState, type UseSeoStateReturn } from "./useSeoState";
import type { UsePageDetailStateReturn } from "./usePageDetailState";

/**
 * Facade for page SEO display state on the detail view.
 * Presentation via `useSeoState`; persistence stays in the page save flow.
 */
export function usePageSeo(
  pageDetailState?: UsePageDetailStateReturn,
): UseSeoStateReturn {
  return useSeoState(pageDetailState);
}

export type { UseSeoStateReturn as UsePageSeoReturn };
