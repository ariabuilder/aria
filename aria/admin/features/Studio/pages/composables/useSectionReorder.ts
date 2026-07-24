import { ref, type Ref } from "vue";
import { actions } from "astro:actions";
import { useErrorBoundary } from "@/features/Studio/core/composables/useErrorBoundary";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import { PAGE_DETAIL_ERROR_CODES } from "@/lib/errors/pageDetailErrors";

export interface UseSectionReorderReturn {
  /** Whether a reorder operation is in-flight */
  isReordering: Ref<boolean>;
  /**
   * Persist a new section ordering to the server.
   * Performs optimistic updates on the caller side; this composable
   * reports errors via the error boundary and returns success/failure.
   */
  reorderSections: (slug: string, sectionIds: string[]) => Promise<boolean>;
  /** Reset the reordering state (e.g. on unmount or cancel) */
  resetReorder: () => void;
}

/**
 * Composable for drag-and-drop section reordering. Calls the `pages.
 */
export function useSectionReorder(): UseSectionReorderReturn {
  const isReordering = ref(false);
  const { handleError } = useErrorBoundary();

  /**
   * Persist the new section ordering to the server.
   *
   * @param slug - The page slug
   * @param sectionIds - Array of section IDs in their new order
   * @returns `true` if the reorder succeeded, `false` otherwise
   */
  async function reorderSections(
    slug: string,
    sectionIds: string[],
  ): Promise<boolean> {
    if (sectionIds.length === 0) {
      handleError(
        PAGE_DETAIL_ERROR_CODES.INVALID_SECTION_ORDER,
        "Cannot reorder with an empty section list",
        { severity: "warning" },
      );
      return false;
    }

    isReordering.value = true;

    try {
      const { data, error } = await actions.pages.reorderSections({
        slug,
        sectionIds,
      });

      if (error) {
        if (handleActionResultForbidden({ error }, "pages.reorderSections")) {
          return false;
        }
        handleError(
          PAGE_DETAIL_ERROR_CODES.SECTION_REORDER_FAILED,
          error.message ?? "Failed to reorder sections",
          {
            details: "The section order could not be saved. Changes have been reverted.",
            severity: "error",
          },
        );
        return false;
      }

      return data !== undefined;
    } catch (err) {
      handleError(
        PAGE_DETAIL_ERROR_CODES.SECTION_REORDER_FAILED,
        err instanceof Error ? err.message : "Failed to reorder sections",
        {
          details: "The section order could not be saved. Changes have been reverted.",
          severity: "error",
        },
      );
      return false;
    } finally {
      isReordering.value = false;
    }
  }

  /**
   * Reset the reordering state.
   */
  function resetReorder(): void {
    isReordering.value = false;
  }

  return {
    isReordering,
    reorderSections,
    resetReorder,
  };
}
