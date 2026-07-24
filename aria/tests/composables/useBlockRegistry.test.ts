import { beforeEach, describe, expect, it, vi } from "vitest";

const { initMock, loggerMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  loggerMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    init: (...args: unknown[]) => initMock(...args),
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

describe("useBlockRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("keeps the registry empty when init returns malformed components", async () => {
    initMock.mockResolvedValue({
      data: {
        components: [{ id: "hero-banner", name: "Hero Banner" }],
      },
      error: null,
    });

    const { useBlockRegistry } =
      await import("../../admin/features/Blocks/composables/useBlockRegistry");

    const registry = useBlockRegistry();

    await registry.refreshComponents();

    expect(registry.components.value).toEqual([]);
    expect(registry.error.value).toBe("Failed to fetch components");
    expect(registry.loading.value).toBe(false);
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Blocks] Invalid block registry components response",
      expect.objectContaining({
        source: "useBlockRegistry.refreshComponents",
        issues: expect.any(Array),
      }),
    );
  });
});
