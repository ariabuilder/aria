import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getItemMock,
  createItemMock,
  toastErrorMock,
  toastSuccessMock,
  loggerMock,
} = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  createItemMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  loggerMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    getItem: (...args: unknown[]) => getItemMock(...args),
    createItem: (...args: unknown[]) => createItemMock(...args),
  },
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

const validNode = {
  id: "component-root",
  type: "Container",
  props: {},
  styles: {},
  children: [],
};

describe("useBlockData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("fails closed when slug availability checks return malformed component payloads", async () => {
    getItemMock.mockResolvedValue({
      data: {
        id: "hero-banner",
        name: "Hero Banner",
      },
      error: null,
    });

    const { useBlockData } =
      await import("../../admin/features/Blocks/composables/useBlockData");

    const composable = useBlockData();
    const result = await composable.convertNodesToComponent([validNode], {
      name: "Hero Banner",
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to verify existing component slug",
    });
    expect(createItemMock).not.toHaveBeenCalled();
    expect(composable.error.value).toBe(
      "Failed to verify existing component slug",
    );
    expect(composable.converting.value).toBe(false);
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to create component: Failed to verify existing component slug",
    );
  });
});
