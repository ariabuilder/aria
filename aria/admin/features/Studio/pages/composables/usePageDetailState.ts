import { ref, computed, type Ref, type ComputedRef } from "vue";
import { useRoute } from "vue-router";
import { actions } from "astro:actions";
import { useErrorBoundary } from "@/features/Studio/core/composables/useErrorBoundary";
import type { PageDSL } from "@/lib/types/nodes";
import {
  computePageAnalytics,
  type PageAnalytics,
} from "@/lib/blocks/nodeAnalytics";
import { PAGE_DETAIL_ERROR_CODES } from "@/lib/errors/pageDetailErrors";
import type { PageDetailError } from "@/lib/errors/pageDetailErrors";
import { usePageResourceBank } from "./usePageResourceBank";

export interface UsePageDetailStateReturn {
  page: Ref<PageDSL | null>;
  /** The page slug from route params */
  slug: ComputedRef<string>;
  isLoading: Ref<boolean>;
  isSaving: Ref<boolean>;
  isLoaded: Ref<boolean>;
  currentError: Ref<PageDetailError | null>;
  clearError: () => void;

  title: ComputedRef<string>;
  /** The page status (draft/published/archived) */
  status: ComputedRef<string | undefined>;
  previewUrl: ComputedRef<string>;

  /** Cached page analytics from _computedMetrics (O(1) read) */
  analytics: ComputedRef<PageAnalytics | null>;

  loadPage: (nextSlug?: string) => Promise<void>;
  savePage: (options?: {
    activityMetadata?: string;
  }) => Promise<string | undefined>;
  /** Update a single field on the page and optionally save */
  updateField: <K extends keyof PageDSL>(key: K, value: PageDSL[K]) => void;
}

export type PageDetailRemoteLoadMerge = (
  current: PageDSL,
  incoming: PageDSL,
) => PageDSL;

let remoteLoadMerge: PageDetailRemoteLoadMerge | null = null;

export function setPageDetailRemoteLoadMerge(
  merge: PageDetailRemoteLoadMerge | null,
): void {
  remoteLoadMerge = merge;
}

export function resolveLoadedPageDetail(
  current: PageDSL | null,
  incoming: PageDSL,
  merge: PageDetailRemoteLoadMerge | null = remoteLoadMerge,
): PageDSL {
  return current && merge ? merge(current, incoming) : incoming;
}

let pageDetailState: UsePageDetailStateReturn | null = null;

function createPageDetailState(): UsePageDetailStateReturn {
  const route = useRoute();
  const { currentError, clearError, handleError } = useErrorBoundary();
  const pageResourceBank = usePageResourceBank();

  /** The page slug extracted from route params */
  const slug = computed<string>(() => route.params.slug as string);

  const page = ref(null as unknown) as Ref<PageDSL | null>;

  const activeSlug = ref<string | null>(null);
  const pendingSlug = ref<string | null>(null);
  const isRevalidating = ref<boolean>(false);

  const isLoading = ref<boolean>(false);

  const isSaving = ref<boolean>(false);

  const isLoaded = ref<boolean>(false);

  /** The page title, falling back to "Untitled" */
  const title = computed<string>(() => page.value?.title ?? "Untitled");

  /** The page status (draft / published / archived) */
  const status = computed<string | undefined>(() => page.value?.status);

  const previewUrl = computed<string>(() => {
    if (!page.value?.slug) return "";
    const base = "/__preview";
    return `${base}/${page.value.slug}`;
  });

  const analytics = computed<PageAnalytics | null>(() => {
    const metrics = page.value?._computedMetrics;

    if (metrics) {
      return {
        sectionCount: metrics.sectionCount,
        componentCount: metrics.componentCount,
        mediaCount: metrics.mediaCount,
        dynamicCount: metrics.dynamicCount,
        customCodeCount: metrics.customCodeCount,
      };
    }

    if (page.value?.nodes) {
      return computePageAnalytics(page.value.nodes);
    }

    return null;
  });

  let loadGeneration = 0;

  function applyLoadedPage(nextPage: PageDSL, targetSlug: string): void {
    if ((nextPage.slug ?? nextPage.id) !== targetSlug && nextPage.id !== targetSlug) {
      return;
    }

    const current = page.value;
    page.value = resolveLoadedPageDetail(current, nextPage);
    isLoaded.value = true;
    clearError();
  }

  async function loadPage(nextSlug?: string): Promise<void> {
    const targetSlug = (nextSlug ?? slug.value ?? "").trim();
    if (!targetSlug || targetSlug === "new") return;

    const generation = loadGeneration + 1;
    loadGeneration = generation;
    activeSlug.value = targetSlug;
    pendingSlug.value = targetSlug;
    isLoaded.value = false;
    clearError();

    const cached = pageResourceBank.getCachedPage(targetSlug);
    if (cached) {
      applyLoadedPage(cached.page, targetSlug);
      isLoading.value = false;

      if (!pageResourceBank.isStale(cached)) {
        pendingSlug.value = null;
        isRevalidating.value = false;
        return;
      }

      isRevalidating.value = true;

      void pageResourceBank
        .loadPage(targetSlug, {
          priority: "active",
          revalidate: true,
        })
        .then((fresh) => {
          if (generation !== loadGeneration || activeSlug.value !== targetSlug) {
            return;
          }
          applyLoadedPage(fresh.page, targetSlug);
        })
        .catch((err) => {
          if (generation !== loadGeneration || activeSlug.value !== targetSlug) {
            return;
          }
          handleError(
            PAGE_DETAIL_ERROR_CODES.PAGE_LOAD_FAILED,
            err instanceof Error ? err.message : "Failed to refresh page",
            { severity: "warning", retry: () => loadPage(targetSlug) },
          );
        })
        .finally(() => {
          if (generation !== loadGeneration || activeSlug.value !== targetSlug) {
            return;
          }
          isRevalidating.value = false;
          pendingSlug.value = null;
        });

      return;
    }

    page.value = null;
    isLoading.value = true;
    isRevalidating.value = false;

    try {
      const entry = await pageResourceBank.loadPage(targetSlug, {
        priority: "active",
      });

      if (generation !== loadGeneration || activeSlug.value !== targetSlug) {
        return;
      }

      applyLoadedPage(entry.page, targetSlug);
    } catch (err) {
      if (generation !== loadGeneration || activeSlug.value !== targetSlug) {
        return;
      }

      page.value = null;
      handleError(
        PAGE_DETAIL_ERROR_CODES.PAGE_LOAD_FAILED,
        err instanceof Error ? err.message : "Failed to load page",
        { severity: "critical", retry: () => loadPage(targetSlug) },
      );
    } finally {
      if (generation === loadGeneration && activeSlug.value === targetSlug) {
        isLoading.value = false;
        pendingSlug.value = null;
      }
    }
  }

  async function savePage(options?: {
    activityMetadata?: string;
  }): Promise<string | undefined> {
    if (!page.value?.slug) return;

    isSaving.value = true;
    const previousPage = { ...page.value };

    try {
      const { data, error } = await actions.updateItem({
        collection: "pages",
        slug: page.value.slug,
        data: page.value as unknown as Record<string, unknown>,
      });

      if (error) {
        page.value = previousPage as PageDSL;
        handleError(PAGE_DETAIL_ERROR_CODES.PAGE_SAVE_FAILED, error.message, {
          severity: "error",
          retry: () => {
            savePage(options);
          },
        });
        return;
      }

      const responseData = data as Record<string, unknown>;
      return responseData.version as string | undefined;
    } catch (err) {
      page.value = previousPage as PageDSL;
      handleError(
        PAGE_DETAIL_ERROR_CODES.PAGE_SAVE_FAILED,
        err instanceof Error ? err.message : "Failed to save page",
        {
          severity: "error",
          retry: () => {
            savePage(options);
          },
        },
      );
      return;
    } finally {
      isSaving.value = false;
    }
  }

  function updateField<K extends keyof PageDSL>(
    key: K,
    value: PageDSL[K],
  ): void {
    if (!page.value) return;
    page.value = { ...page.value, [key]: value };
  }

  return {
    page,
    slug,
    isLoading,
    isSaving,
    isLoaded,
    currentError,
    clearError,
    title,
    status,
    previewUrl,
    analytics,
    loadPage,
    savePage,
    updateField,
  };
}

/**
 * `usePageDetailState` The single source of truth for all page detail data. Every component
 * in the Page Detail View depends on this composable for shared state.
 */
export function usePageDetailState(): UsePageDetailStateReturn {
  if (!pageDetailState) {
    pageDetailState = createPageDetailState();
  }
  return pageDetailState;
}

export function __resetPageDetailStateForTests(): void {
  remoteLoadMerge = null;
  pageDetailState = null;
}
