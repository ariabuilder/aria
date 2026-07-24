import { beforeEach, describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";

import { useMediaViewState } from "../../admin/features/Studio/media/composables/useMediaViewState";
import type { MediaAsset } from "../../admin/features/Studio/media/types";

const sampleAssets: MediaAsset[] = [
  {
    id: "image-1",
    name: "hero.jpg",
    type: "image",
    url: "/uploads/hero.jpg",
    size: 480_000,
    uploadedAt: "2026-04-05T09:00:00.000Z",
  },
  {
    id: "video-1",
    name: "launch.mp4",
    type: "video",
    url: "/uploads/launch.mp4",
    size: 2_480_000,
    uploadedAt: "2026-04-08T09:00:00.000Z",
  },
  {
    id: "font-1",
    name: "brand.woff2",
    type: "other",
    url: "/uploads/brand.woff2",
    size: 82_000,
    mimeType: "font/woff2",
    uploadedAt: "2026-04-07T09:00:00.000Z",
  },
  {
    id: "icon-1",
    name: "brand-mark.svg",
    type: "icon",
    url: "/uploads/brand-mark.svg",
    size: 12_000,
    mimeType: "image/svg+xml",
    uploadedAt: "2026-04-06T09:00:00.000Z",
  },
  {
    id: "file-1",
    name: "brief.pdf",
    type: "document",
    url: "/uploads/brief.pdf",
    size: 245_000,
    uploadedAt: "2026-04-04T09:00:00.000Z",
  },
];

describe("useMediaViewState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("filters assets across all media tabs including fonts, icons, and files", async () => {
    const assets = ref(sampleAssets);
    const state = useMediaViewState({ assets });

    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "video-1",
      "font-1",
      "icon-1",
      "image-1",
      "file-1",
    ]);

    state.activeFilter.value = "image";
    await nextTick();
    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "image-1",
    ]);

    state.activeFilter.value = "video";
    await nextTick();
    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "video-1",
    ]);

    state.activeFilter.value = "font";
    await nextTick();
    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "font-1",
    ]);

    state.activeFilter.value = "icon";
    await nextTick();
    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "icon-1",
    ]);

    state.activeFilter.value = "file";
    await nextTick();
    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "file-1",
    ]);
  });

  it("applies the search query within the active media filter", async () => {
    const assets = ref(sampleAssets);
    const state = useMediaViewState({ assets });

    state.activeFilter.value = "all";
    state.searchQuery.value = "brand";
    await nextTick();

    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "font-1",
      "icon-1",
    ]);

    state.activeFilter.value = "icon";
    await nextTick();

    expect(state.filteredAssets.value.map((asset) => asset.id)).toEqual([
      "icon-1",
    ]);
    expect(state.activeFilterLabel.value).toBe("Icons");
  });
});
