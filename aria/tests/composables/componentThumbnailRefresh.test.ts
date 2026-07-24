import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueComponentThumbnailGenerationMock = vi.hoisted(() => vi.fn());

vi.mock(
  "../../admin/features/Studio/components/composables/componentThumbnailBackgroundQueue",
  () => ({
    enqueueComponentThumbnailGeneration: enqueueComponentThumbnailGenerationMock,
  }),
);

vi.mock("../../admin/features/Studio/pages/utils/deviceCapabilities", () => ({
  isThumbnailCaptureSupported: () => true,
}));

import {
  refreshComponentThumbnail,
  resetComponentThumbnailRefreshState,
} from "../../admin/features/Studio/components/composables/componentThumbnailRefresh";

describe("componentThumbnailRefresh", () => {
  beforeEach(() => {
    resetComponentThumbnailRefreshState();
    enqueueComponentThumbnailGenerationMock.mockReset();
    enqueueComponentThumbnailGenerationMock.mockResolvedValue(
      "/admin/api/component-thumbnails/hero-cta",
    );
  });

  it("enqueuees thumbnail generation without calling saveSnapshot", async () => {
    const thumbnailUrl = await refreshComponentThumbnail("hero-cta", {
      force: true,
    });

    expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledWith(
      "hero-cta",
      { force: true },
    );
    expect(thumbnailUrl).toBe("/admin/api/component-thumbnails/hero-cta");
  });

  it("dedupes concurrent refresh requests for the same component", async () => {
    let resolveEnqueue: ((value: string) => void) | undefined;
    enqueueComponentThumbnailGenerationMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnqueue = resolve;
        }),
    );

    const first = refreshComponentThumbnail("hero-cta", { force: true });
    const second = refreshComponentThumbnail("hero-cta", { force: true });

    expect(enqueueComponentThumbnailGenerationMock).toHaveBeenCalledTimes(1);

    resolveEnqueue?.("/admin/api/component-thumbnails/hero-cta");
    await expect(first).resolves.toBe("/admin/api/component-thumbnails/hero-cta");
    await expect(second).resolves.toBe("/admin/api/component-thumbnails/hero-cta");
  });
});
