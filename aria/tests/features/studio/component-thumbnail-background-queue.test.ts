import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureComponentThumbnailMock = vi.hoisted(() => vi.fn());
const regenerateComponentThumbnailMock = vi.hoisted(() => vi.fn());

vi.mock(
  "../../../admin/features/Studio/components/composables/componentThumbnailGenerator",
  () => ({
    ensureComponentThumbnail: ensureComponentThumbnailMock,
    regenerateComponentThumbnail: regenerateComponentThumbnailMock,
  }),
);

import {
  componentGeneratedThumbnailUrls,
  componentThumbnailGenerationEpoch,
  enqueueComponentThumbnailGeneration,
  resetComponentThumbnailBackgroundQueue,
} from "../../../admin/features/Studio/components/composables/componentThumbnailBackgroundQueue";

describe("componentThumbnailBackgroundQueue", () => {
  beforeEach(() => {
    resetComponentThumbnailBackgroundQueue();
    ensureComponentThumbnailMock.mockReset();
    regenerateComponentThumbnailMock.mockReset();
    ensureComponentThumbnailMock.mockImplementation(async ({ componentId }) =>
      `/admin/api/component-thumbnails/${componentId}`,
    );
    regenerateComponentThumbnailMock.mockImplementation(async ({ componentId }) =>
      `/admin/api/component-thumbnails/${componentId}?forced=1`,
    );
  });

  afterEach(() => {
    resetComponentThumbnailBackgroundQueue();
  });

  it("dedupes and processes thumbnail generation sequentially", async () => {
    const firstHeroGeneration = enqueueComponentThumbnailGeneration("hero-cta");
    const duplicateHeroGeneration =
      enqueueComponentThumbnailGeneration("hero-cta");
    enqueueComponentThumbnailGeneration("pricing-card");

    expect(duplicateHeroGeneration).toBe(firstHeroGeneration);
    await expect(firstHeroGeneration).resolves.toContain(
      "/admin/api/component-thumbnails/hero-cta",
    );

    await vi.waitFor(() => {
      expect(ensureComponentThumbnailMock).toHaveBeenCalledTimes(2);
    });

    expect(ensureComponentThumbnailMock).toHaveBeenNthCalledWith(1, {
      componentId: "hero-cta",
    });
    expect(ensureComponentThumbnailMock).toHaveBeenNthCalledWith(2, {
      componentId: "pricing-card",
    });
    expect(componentThumbnailGenerationEpoch.value["hero-cta"]).toBe(1);
    expect(componentThumbnailGenerationEpoch.value["pricing-card"]).toBe(1);
    expect(componentGeneratedThumbnailUrls.value["hero-cta"]).toContain(
      "/admin/api/component-thumbnails/hero-cta",
    );
    expect(componentGeneratedThumbnailUrls.value["hero-cta"]).toContain("cv=");
  });

  it("clears requested state after a failed generation so retries can run", async () => {
    ensureComponentThumbnailMock.mockResolvedValueOnce(null);

    enqueueComponentThumbnailGeneration("hero-cta");

    await vi.waitFor(() => {
      expect(ensureComponentThumbnailMock).toHaveBeenCalledTimes(1);
    });

    enqueueComponentThumbnailGeneration("hero-cta");

    await vi.waitFor(() => {
      expect(ensureComponentThumbnailMock).toHaveBeenCalledTimes(2);
    });
  });

  it("continues the queue when one generation throws", async () => {
    ensureComponentThumbnailMock
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce("/admin/api/component-thumbnails/pricing-card");

    enqueueComponentThumbnailGeneration("hero-cta");
    enqueueComponentThumbnailGeneration("pricing-card");

    await vi.waitFor(() => {
      expect(ensureComponentThumbnailMock).toHaveBeenCalledTimes(2);
    });

    expect(componentThumbnailGenerationEpoch.value["hero-cta"]).toBeUndefined();
    expect(componentThumbnailGenerationEpoch.value["pricing-card"]).toBe(1);
  });

  it("does not re-enqueue the same component unless forced", async () => {
    ensureComponentThumbnailMock.mockResolvedValueOnce(null);

    enqueueComponentThumbnailGeneration("hero-cta");
    enqueueComponentThumbnailGeneration("hero-cta");

    await vi.waitFor(() => {
      expect(ensureComponentThumbnailMock).toHaveBeenCalledTimes(1);
    });

    enqueueComponentThumbnailGeneration("hero-cta", { force: true });

    await vi.waitFor(() => {
      expect(regenerateComponentThumbnailMock).toHaveBeenCalledTimes(1);
    });
    expect(regenerateComponentThumbnailMock).toHaveBeenCalledWith({
      componentId: "hero-cta",
    });
  });

  it("force re-enqueues after a successful generation", async () => {
    enqueueComponentThumbnailGeneration("hero-cta");

    await vi.waitFor(() => {
      expect(ensureComponentThumbnailMock).toHaveBeenCalledTimes(1);
    });

    enqueueComponentThumbnailGeneration("hero-cta");

    await vi.waitFor(() => {
      expect(ensureComponentThumbnailMock).toHaveBeenCalledTimes(1);
    });

    enqueueComponentThumbnailGeneration("hero-cta", { force: true });

    await vi.waitFor(() => {
      expect(regenerateComponentThumbnailMock).toHaveBeenCalledTimes(1);
    });
  });
});
