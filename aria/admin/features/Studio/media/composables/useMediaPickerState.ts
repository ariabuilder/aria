import { computed, ref, watch, type Ref } from "vue";
import { z } from "zod";

import type { MediaAsset } from "../types/media";
import {
  assetMatchesMediaTypeFilter,
  type MediaTypeFilter,
} from "../utils/mediaPickerUtils";

const PickerViewModeSchema = z.enum(["grid", "list"]);
export type MediaPickerViewMode = z.infer<typeof PickerViewModeSchema>;

const VIEW_MODE_KEY = "aria:media-picker:view-mode";

interface UseMediaPickerStateOptions {
  assets: Ref<MediaAsset[]>;
  mediaType: Ref<MediaTypeFilter>;
  activeGroupId?: Ref<string | null>;
  assignments?: Ref<Record<string, string>>;
}

function getInitialViewMode(): MediaPickerViewMode {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
    return "grid";
  }

  const stored = sessionStorage.getItem(VIEW_MODE_KEY);
  const parsed = PickerViewModeSchema.safeParse(stored);
  return parsed.success ? parsed.data : "grid";
}

export function useMediaPickerState(options: UseMediaPickerStateOptions) {
  const searchQuery = ref("");
  const viewMode = ref<MediaPickerViewMode>(getInitialViewMode());

  const filteredAssets = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    const activeGroupId = options.activeGroupId?.value ?? null;
    const assignments = options.assignments?.value ?? {};

    return options.assets.value.filter((asset) => {
      if (!assetMatchesMediaTypeFilter(asset, options.mediaType.value)) {
        return false;
      }
      if (activeGroupId && assignments[asset.id] !== activeGroupId) {
        return false;
      }
      if (!query) return true;

      return (
        asset.name.toLowerCase().includes(query) ||
        asset.url.toLowerCase().includes(query)
      );
    });
  });

  function toggleViewMode(): void {
    viewMode.value = viewMode.value === "grid" ? "list" : "grid";
  }

  function reset(): void {
    searchQuery.value = "";
  }

  watch(viewMode, (value) => {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
      return;
    }

    sessionStorage.setItem(VIEW_MODE_KEY, value);
  });

  return {
    searchQuery,
    viewMode,
    filteredAssets,
    toggleViewMode,
    reset,
  };
}
