export const COMPONENT_THUMBNAIL_GRID_PRESET_VERSION = "component-grid-16x9-v2";

export function getComponentThumbnailPresetKey(input: {
  componentId: string;
  updatedAt?: string | null;
}): string {
  return [
    "aria:component-thumbnail-preset",
    COMPONENT_THUMBNAIL_GRID_PRESET_VERSION,
    input.componentId.trim(),
    input.updatedAt ?? "unknown",
  ].join(":");
}

export function hasCurrentComponentThumbnailPreset(input: {
  componentId: string;
  updatedAt?: string | null;
  thumbnailUrl?: string | null;
}): boolean {
  if (!input.thumbnailUrl || typeof window === "undefined") {
    return false;
  }

  return (
    window.localStorage.getItem(getComponentThumbnailPresetKey(input)) === "1"
  );
}

export function markCurrentComponentThumbnailPreset(input: {
  componentId: string;
  updatedAt?: string | null;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getComponentThumbnailPresetKey(input),
    "1",
  );
}
