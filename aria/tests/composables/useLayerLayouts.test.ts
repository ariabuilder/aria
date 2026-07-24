import { beforeEach, describe, expect, it, vi } from "vitest";

const { initMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    init: (...args: unknown[]) => initMock(...args),
  },
}));

describe("useLayerLayouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to an empty layout list when init returns a malformed payload", async () => {
    initMock.mockResolvedValue({
      data: {
        layouts: {},
      },
      error: null,
    });

    const { useLayerLayouts } =
      await import("../../admin/features/Layers/composables/useLayerLayouts");

    const composable = useLayerLayouts({
      emitUpdateLayout: vi.fn(),
    });

    await composable.fetchLayouts();

    expect(composable.availableLayouts.value).toEqual([]);
    expect(composable.isLoadingLayouts.value).toBe(false);
  });
});
