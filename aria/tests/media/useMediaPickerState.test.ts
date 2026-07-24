import { beforeEach, describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";

import { useMediaPickerState } from "../../admin/features/Studio/media/composables/useMediaPickerState";
import type { MediaAsset } from "../../admin/features/Studio/media/types/media";

const sampleAssets: MediaAsset[] = [
  {
    id: "image-1",
    name: "hero.jpg",
    type: "image",
    url: "/uploads/hero.jpg",
    size: 480_000,
  },
  {
    id: "video-1",
    name: "launch.mp4",
    type: "video",
    url: "/uploads/launch.mp4",
    size: 2_480_000,
  },
  {
    id: "image-2",
    name: "logo.png",
    type: "image",
    url: "/uploads/logo.png",
    size: 180_000,
  },
];

describe("useMediaPickerState", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("filters assets reactively by mediaType", async () => {
    const assets = ref(sampleAssets);
    const mediaType = ref<MediaAsset["type"] | undefined>(undefined);
    const state = useMediaPickerState({ assets, mediaType });

    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "image-1",
      "video-1",
      "image-2",
    ]);

    mediaType.value = "image";
    await nextTick();
    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "image-1",
      "image-2",
    ]);
  });

  it("filters assets by search query", async () => {
    const assets = ref(sampleAssets);
    const mediaType = ref<MediaAsset["type"] | undefined>(undefined);
    const state = useMediaPickerState({ assets, mediaType });

    state.searchQuery.value = "launch";
    await nextTick();

    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "video-1",
    ]);
  });

  it("filters assets by active media folder", async () => {
    const assets = ref(sampleAssets);
    const mediaType = ref<MediaAsset["type"] | undefined>(undefined);
    const activeGroupId = ref<string | null>("grp-brand");
    const assignments = ref<Record<string, string>>({
      "image-1": "grp-brand",
      "video-1": "grp-social",
    });
    const state = useMediaPickerState({
      assets,
      mediaType,
      activeGroupId,
      assignments,
    });

    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "image-1",
    ]);

    activeGroupId.value = null;
    await nextTick();
    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "image-1",
      "video-1",
      "image-2",
    ]);
  });

  it("intersects folder, media type, and search filters", async () => {
    const assets = ref(sampleAssets);
    const mediaType = ref<MediaAsset["type"] | undefined>("image");
    const activeGroupId = ref<string | null>("grp-brand");
    const assignments = ref<Record<string, string>>({
      "image-1": "grp-brand",
      "video-1": "grp-brand",
      "image-2": "grp-brand",
    });
    const state = useMediaPickerState({
      assets,
      mediaType,
      activeGroupId,
      assignments,
    });

    state.searchQuery.value = "logo";
    await nextTick();

    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "image-2",
    ]);
  });

  it("persists view mode in sessionStorage with invalid value fallback", async () => {
    sessionStorage.setItem("aria:media-picker:view-mode", "invalid");

    const assets = ref(sampleAssets);
    const mediaType = ref<MediaAsset["type"] | undefined>(undefined);
    const state = useMediaPickerState({ assets, mediaType });

    expect(state.viewMode.value).toBe("grid");

    state.toggleViewMode();
    await nextTick();
    expect(state.viewMode.value).toBe("list");
    expect(sessionStorage.getItem("aria:media-picker:view-mode")).toBe("list");
  });

  it("reset clears search without resetting persisted view mode", async () => {
    const assets = ref(sampleAssets);
    const mediaType = ref<MediaAsset["type"] | undefined>(undefined);
    const state = useMediaPickerState({ assets, mediaType });

    state.viewMode.value = "list";
    state.searchQuery.value = "hero";
    state.reset();
    await nextTick();

    expect(state.searchQuery.value).toBe("");
    expect(state.viewMode.value).toBe("list");
  });
});
