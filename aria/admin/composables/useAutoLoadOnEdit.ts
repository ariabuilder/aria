/**
 * Automatically loads pages/layouts/components when entering edit mode. Watches the
 * editing mode state and triggers the appropriate loading action.
 */

import { watch } from "vue";
import { useAppRouter } from "@/features/Core";
import type { useItemLoading } from "./useItemLoading";
import { traceStartup } from "@/lib/startupTrace";

/**
 * Setup automatic item loading when edit mode is triggered
 */
export function useAutoLoadOnEdit(
  itemLoading: ReturnType<typeof useItemLoading>,
): void {
  const appRouter = useAppRouter();

  /**
   * Watch for editing mode changes and auto-load items
   * When user clicks "Edit" in Studio, this loads the page/layout/component
   */
  watch(
    () => appRouter.editingMode.value,
    async (newMode, oldMode) => {
      traceStartup("auto-load-on-edit:watch", {
        fromEditing: Boolean(oldMode?.isEditing),
        toEditing: Boolean(newMode.isEditing),
        itemType: newMode.itemType,
        itemSlug: newMode.itemSlug,
      });

      const targetChanged =
        !oldMode?.isEditing ||
        newMode.itemType !== oldMode.itemType ||
        newMode.itemSlug !== oldMode.itemSlug;

      // Load when entering edit mode and when switching to another staged item.
      if (
        newMode.isEditing &&
        targetChanged &&
        newMode.itemSlug &&
        newMode.itemType
      ) {
        if (import.meta.env.DEV) {
          console.log(
            `[useAutoLoadOnEdit] Auto-loading ${newMode.itemType}: ${newMode.itemSlug}`,
          );
        }

        try {
          traceStartup("auto-load-on-edit:start", {
            itemType: newMode.itemType,
            itemSlug: newMode.itemSlug,
          });

          if (newMode.itemType === "page") {
            await itemLoading.loadPage(newMode.itemSlug);
          } else if (newMode.itemType === "layout") {
            await itemLoading.loadLayout(newMode.itemSlug);
          } else if (newMode.itemType === "component") {
            await itemLoading.loadComponent(newMode.itemSlug);
          }

          traceStartup("auto-load-on-edit:end", {
            itemType: newMode.itemType,
            itemSlug: newMode.itemSlug,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[useAutoLoadOnEdit] Failed to load ${newMode.itemType}:`,
            error,
          );
          itemLoading.reportLoadFailure(errorMessage);
          traceStartup("auto-load-on-edit:error", {
            itemType: newMode.itemType,
            itemSlug: newMode.itemSlug,
            error: errorMessage,
          });
        }
      }
    },
    { deep: true, immediate: true },
  );
}
