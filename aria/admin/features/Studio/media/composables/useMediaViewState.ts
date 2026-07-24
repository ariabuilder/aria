import { computed, ref, watch, type Ref } from "vue";

import type { MediaAsset } from "../types";
import { isFontAsset } from "../utils";
import { useStudioI18n } from "@/i18n";

interface UseMediaViewStateOptions {
  assets: Ref<MediaAsset[]>;
  activeGroupId?: Ref<string | null>;
  assignments?: Ref<Record<string, string>>;
}

export type MediaViewFilterId =
  | "all"
  | "image"
  | "video"
  | "font"
  | "icon"
  | "file";

export const MEDIA_VIEW_FILTER_TABS = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "font", label: "Fonts" },
  { id: "icon", label: "Icons" },
  { id: "file", label: "Files" },
] as const satisfies ReadonlyArray<{
  id: MediaViewFilterId;
  label: string;
}>;

const VIEW_MODE_KEY = "aria:media:view-mode";
const GRID_SORT_KEY = "aria:media:grid-sort";

export type MediaSortKey = "uploaded" | "name" | "size" | "type" | "extension";
export type MediaSortDirection = "asc" | "desc";
export interface MediaSort {
  key: MediaSortKey;
  direction: MediaSortDirection;
}

function parseMediaSort(value: unknown): MediaSort {
  const fallback: MediaSort = { key: "uploaded", direction: "desc" };
  if (
    value === "uploaded" ||
    value === "name" ||
    value === "size" ||
    value === "type" ||
    value === "extension"
  ) {
    return {
      key: value,
      direction: value === "uploaded" || value === "size" ? "desc" : "asc",
    };
  }

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as { key?: unknown; direction?: unknown };
  const key = record.key;
  const direction = record.direction;
  const validKey: MediaSortKey | null = (
    key === "uploaded" ||
    key === "name" ||
    key === "size" ||
    key === "type" ||
    key === "extension"
  ) ? key : null;
  const validDirection = (
    direction === "asc" ||
    direction === "desc"
  ) ? direction : null;

  return validKey && validDirection
    ? { key: validKey, direction: validDirection }
    : fallback;
}

function getInitialGridSort(): MediaSort {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return parseMediaSort(null);
  }

  try {
    return parseMediaSort(
      JSON.parse(localStorage.getItem(GRID_SORT_KEY) ?? "null"),
    );
  } catch {
    return parseMediaSort(localStorage.getItem(GRID_SORT_KEY));
  }
}

function getInitialViewMode(): "grid" | "list" {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "grid";
  }

  const stored = localStorage.getItem(VIEW_MODE_KEY);
  return stored === "list" ? "list" : "grid";
}

function getStoredMediaFilter(): MediaViewFilterId {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "all";
  }

  const stored = localStorage.getItem("media-view-filter");
  return MEDIA_VIEW_FILTER_TABS.some((tab) => tab.id === stored)
    ? (stored as MediaViewFilterId)
    : "all";
}

function isFileBucketAsset(asset: MediaAsset): boolean {
  return (
    asset.type !== "image" &&
    asset.type !== "video" &&
    asset.type !== "icon" &&
    !isFontAsset(asset)
  );
}

function getMediaExtension(asset: MediaAsset): string {
  const name = asset.name.trim();
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > -1 ? name.slice(dotIndex + 1).toLowerCase() : "";
}

function compareText(
  left: string | undefined,
  right: string | undefined,
): number {
  return (left || "").localeCompare(right || "");
}

function compareMediaAssets(
  left: MediaAsset,
  right: MediaAsset,
  sort: MediaSort,
): number {
  const multiplier = sort.direction === "asc" ? 1 : -1;
  let result = 0;

  if (sort.key === "size") {
    result = left.size - right.size;
  } else if (sort.key === "type") {
    result = compareText(left.type, right.type);
  } else if (sort.key === "extension") {
    result = compareText(getMediaExtension(left), getMediaExtension(right));
  } else if (sort.key === "name") {
    result = compareText(left.name, right.name);
  } else {
    result =
      new Date(left.uploadedAt || 0).getTime() -
      new Date(right.uploadedAt || 0).getTime();
  }

  return result === 0
    ? compareText(left.name, right.name)
    : result * multiplier;
}

function matchesActiveFilter(
  asset: MediaAsset,
  activeFilter: MediaViewFilterId,
): boolean {
  switch (activeFilter) {
    case "all":
      return true;
    case "font":
      return isFontAsset(asset);
    case "file":
      return isFileBucketAsset(asset);
    default:
      return asset.type === activeFilter;
  }
}

function mediaFilterLabel(
  id: MediaViewFilterId,
  t: ReturnType<typeof useStudioI18n>["t"],
): string {
  switch (id) {
    case "image": return t("media.filter.images");
    case "video": return t("media.filter.videos");
    case "font": return t("media.filter.fonts");
    case "icon": return t("media.filter.icons");
    case "file": return t("media.filter.files");
    default: return t("media.filter.all");
  }
}

export function useMediaViewState(options: UseMediaViewStateOptions) {
  const { t } = useStudioI18n();
  const searchQuery = ref("");
  const viewMode = ref<"grid" | "list">(getInitialViewMode());
  const sortBy = ref<MediaSort>(getInitialGridSort());
  const activeFilter = ref<MediaViewFilterId>(getStoredMediaFilter());
  const isPreviewDialogOpen = ref(false);
  const previewAsset = ref<MediaAsset | null>(null);

  const stats = computed(() => ({
    total: options.assets.value.length,
    images: options.assets.value.filter((asset) => asset.type === "image")
      .length,
    size: options.assets.value.reduce((sum, asset) => sum + asset.size, 0),
  }));

  const filteredAssets = computed(() => {
    const query = searchQuery.value.toLowerCase().trim();
    const groupId = options.activeGroupId?.value ?? null;
    const assignments = options.assignments?.value ?? {};

    const result = options.assets.value.filter((asset) =>
      matchesActiveFilter(asset, activeFilter.value),
    );

    const groupFiltered = groupId
      ? result.filter((asset) => assignments[asset.id] === groupId)
      : result;

    const filtered = query
      ? groupFiltered.filter((asset) =>
          asset.name.toLowerCase().includes(query),
        )
      : groupFiltered;

    filtered.sort((a, b) => compareMediaAssets(a, b, sortBy.value));

    return filtered;
  });

  const activeFilterLabel = computed(() => {
    return (
      mediaFilterLabel(activeFilter.value, t)
    );
  });

  const filters = computed(() =>
    MEDIA_VIEW_FILTER_TABS.map((tab) => ({
      key: tab.id,
      label: mediaFilterLabel(tab.id, t),
      count: options.assets.value.filter((asset) =>
        matchesActiveFilter(asset, tab.id),
      ).length,
    })),
  );

  function openPreviewDialog(asset: MediaAsset): void {
    previewAsset.value = asset;
    isPreviewDialogOpen.value = true;
  }

  function closePreviewDialog(): void {
    isPreviewDialogOpen.value = false;
    previewAsset.value = null;
  }

  function toggleViewMode(): void {
    viewMode.value = viewMode.value === "grid" ? "list" : "grid";
  }

  watch(viewMode, (value) => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return;
    }

    localStorage.setItem(VIEW_MODE_KEY, value);
  });

  watch(activeFilter, (value) => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return;
    }

    localStorage.setItem("media-view-filter", value);
  });

  watch(sortBy, (value) => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return;
    }

    localStorage.setItem(GRID_SORT_KEY, JSON.stringify(value));
  }, { deep: true });

  return {
    searchQuery,
    viewMode,
    sortBy,
    activeFilter,
    activeFilterLabel,
    filters,
    isPreviewDialogOpen,
    previewAsset,
    stats,
    filteredAssets,
    openPreviewDialog,
    closePreviewDialog,
    toggleViewMode,
  };
}
