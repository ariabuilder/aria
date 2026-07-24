import { ref } from "vue";
import { actions } from "astro:actions";
import { log } from "@/lib/utils/logger";
import { unwrapLayoutInventoryActionResult } from "../../../composables/layoutInventoryActionResults";
import type { LayoutDSL } from "../../../../lib/types/nodes";

interface UseLayerLayoutsOptions {
  emitUpdateLayout: (layoutSlug: string) => void;
}

export function useLayerLayouts(options: UseLayerLayoutsOptions) {
  const { emitUpdateLayout } = options;

  const availableLayouts = ref<LayoutDSL[]>([]);
  const isLoadingLayouts = ref(false);

  const fetchLayouts = async (): Promise<void> => {
    isLoadingLayouts.value = true;

    try {
      const { data, error } = await actions.init();
      const parsed = unwrapLayoutInventoryActionResult(
        {
          data,
          error,
        },
        "Failed to load layouts",
        {
          source: "useLayerLayouts.fetchLayouts",
        },
      );
      if (!parsed.success) {
        throw new Error(parsed.error);
      }

      availableLayouts.value = parsed.data;
    } catch (error) {
      log("error", "Failed to fetch layouts", {
        error: error instanceof Error ? error.message : String(error),
      });
      availableLayouts.value = [];
    } finally {
      isLoadingLayouts.value = false;
    }
  };

  const handleLayoutChange = (layoutSlug: string): void => {
    emitUpdateLayout(layoutSlug);
  };

  return {
    availableLayouts,
    isLoadingLayouts,
    fetchLayouts,
    handleLayoutChange,
  };
}
