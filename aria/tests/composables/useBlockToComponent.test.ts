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

describe("useBlockToComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("fails closed when createItem returns a malformed success payload", async () => {
    getItemMock.mockResolvedValue({
      data: null,
      error: { message: "Not found" },
    });
    createItemMock.mockResolvedValue({
      data: {
        success: true,
      },
      error: null,
    });

    const { useBlockToComponent } =
      await import("../../admin/composables/useBlockToComponent");

    const composable = useBlockToComponent();
    const result = await composable.convertNodesToComponent([validNode], {
      name: "Hero Banner",
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to save component",
    });
    expect(createItemMock).toHaveBeenCalledTimes(1);
    expect(composable.error.value).toBe("Failed to save component");
    expect(composable.converting.value).toBe(false);
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to create component: Failed to save component",
    );
  });
});
