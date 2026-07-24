import { computed, reactive, type ComputedRef } from "vue";
import {
  SiteUniverseFocusSchema,
  type SiteUniverseFocusSource,
} from "../schemas/dashboard";

const focusBySource = reactive<Record<SiteUniverseFocusSource, string | null>>({
  node: null,
  stream: null,
});

const activePageSlug = computed(
  () => focusBySource.node ?? focusBySource.stream,
);

export interface UseSiteUniverseFocusReturn {
  readonly activePageSlug: ComputedRef<string | null>;
  readonly focusPage: (source: SiteUniverseFocusSource, slug: string) => void;
  readonly clearFocus: (source: SiteUniverseFocusSource) => void;
}

export function useSiteUniverseFocus(): UseSiteUniverseFocusReturn {
  function focusPage(source: SiteUniverseFocusSource, slug: string): void {
    const focus = SiteUniverseFocusSchema.parse({ source, slug });
    focusBySource[focus.source] = focus.slug;
  }

  function clearFocus(source: SiteUniverseFocusSource): void {
    focusBySource[source] = null;
  }

  return { activePageSlug, focusPage, clearFocus };
}
