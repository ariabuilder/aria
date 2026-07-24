import { computed, ref, type ComputedRef, type Ref } from "vue";
import { actions } from "astro:actions";
import {
  GetPageMediaOutputSchema,
  toPageMediaDisplayItems,
  type GetPageMediaOutput,
  type PageMediaDisplayItem,
} from "@/lib/schemas/pageMedia";
import { useErrorBoundary } from "@/features/Studio/core/composables/useErrorBoundary";
import { PAGE_DETAIL_ERROR_CODES } from "@/lib/errors/pageDetailErrors";
import { handleActionResultForbidden } from "@/lib/actionErrors";

export interface UsePageDetailMediaReturn {
  media: Ref<GetPageMediaOutput | null>;
  displayItems: ComputedRef<PageMediaDisplayItem[]>;
  isLoading: Ref<boolean>;
  hasLoadedForSlug: Ref<string | null>;
  loadPageMedia: (
    slug: string,
    options?: { force?: boolean },
  ) => Promise<void>;
  reset: () => void;
}

export function usePageDetailMedia(): UsePageDetailMediaReturn {
  const media = ref<GetPageMediaOutput | null>(null);
  const isLoading = ref(false);
  const hasLoadedForSlug = ref<string | null>(null);
  let loadGeneration = 0;

  const errorBoundary = useErrorBoundary();

  const displayItems = computed(() => {
    if (!media.value) {
      return [];
    }
    return toPageMediaDisplayItems(media.value);
  });

  function reset(): void {
    loadGeneration += 1;
    media.value = null;
    hasLoadedForSlug.value = null;
    isLoading.value = false;
  }

  async function loadPageMedia(
    slug: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const { force = false } = options;

    if (
      !force &&
      hasLoadedForSlug.value === slug &&
      media.value !== null
    ) {
      return;
    }

    const generation = loadGeneration + 1;
    loadGeneration = generation;
    isLoading.value = true;

    try {
      const { data, error } = await actions.pages.getPageMedia({ slug });

      if (generation !== loadGeneration) {
        return;
      }

      if (error) {
        if (handleActionResultForbidden({ error }, "pages.getPageMedia")) {
          return;
        }

        errorBoundary.handleError(
          PAGE_DETAIL_ERROR_CODES.MEDIA_FETCH_FAILED,
          error.message ?? "Failed to load page media",
          { severity: "error" },
        );
        return;
      }

      const parsed = GetPageMediaOutputSchema.safeParse(data);
      if (!parsed.success) {
        errorBoundary.handleError(
          PAGE_DETAIL_ERROR_CODES.MEDIA_FETCH_FAILED,
          "Invalid page media response",
          { severity: "error" },
        );
        return;
      }

      media.value = parsed.data;
      hasLoadedForSlug.value = slug;
    } catch (err) {
      if (generation !== loadGeneration) {
        return;
      }

      errorBoundary.handleError(
        PAGE_DETAIL_ERROR_CODES.MEDIA_FETCH_FAILED,
        err instanceof Error ? err.message : "Failed to load page media",
        { severity: "error" },
      );
    } finally {
      if (generation === loadGeneration) {
        isLoading.value = false;
      }
    }
  }

  return {
    media,
    displayItems,
    isLoading,
    hasLoadedForSlug,
    loadPageMedia,
    reset,
  };
}
