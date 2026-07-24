import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import {
  clearStaleComponentThumbnailIds,
  consumeStaleComponentThumbnailIds,
  markComponentThumbnailStale,
} from "../../../admin/features/Studio/components/composables/componentThumbnailInvalidation";

const refreshComponentsNowMock = vi.hoisted(() => vi.fn(async () => undefined));
const refreshComponentThumbnailMock = vi.hoisted(() =>
  vi.fn<() => Promise<string | null>>(),
);

vi.mock("@/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    components: ref([{ id: "hero-cta" }]),
    refreshComponentsNow: refreshComponentsNowMock,
  }),
}));

vi.mock(
  "@/features/Studio/pages/utils/deviceCapabilities",
  () => ({
    isThumbnailCaptureSupported: () => true,
  }),
);

vi.mock(
  "../../../admin/features/Studio/components/composables/componentThumbnailRefresh",
  () => ({
    refreshComponentThumbnail: refreshComponentThumbnailMock,
  }),
);

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("useComponentThumbnailActions", () => {
  afterEach(() => {
    clearStaleComponentThumbnailIds();
    refreshComponentsNowMock.mockClear();
    refreshComponentThumbnailMock.mockReset();
  });

  it("does not requeue stale thumbnails after an automatic stale refresh failure", async () => {
    refreshComponentThumbnailMock.mockResolvedValue(null);
    markComponentThumbnailStale("hero-cta");

    const { useComponentThumbnailActions } = await import(
      "../../../admin/features/Studio/components/composables/useComponentThumbnailActions"
    );

    await useComponentThumbnailActions().refreshStaleComponentThumbnails();

    expect(refreshComponentThumbnailMock).toHaveBeenCalledWith("hero-cta", {
      force: true,
    });
    expect(consumeStaleComponentThumbnailIds()).toEqual([]);
  });
});
