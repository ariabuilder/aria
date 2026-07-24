import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createItemMock,
  deleteItemMock,
  getItemMock,
  updateItemMock,
  toastErrorMock,
  toastSuccessMock,
  loggerMock,
} = vi.hoisted(() => ({
  createItemMock: vi.fn(),
  deleteItemMock: vi.fn(),
  getItemMock: vi.fn(),
  updateItemMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  loggerMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    createItem: (...args: unknown[]) => createItemMock(...args),
    deleteItem: (...args: unknown[]) => deleteItemMock(...args),
    getItem: (...args: unknown[]) => getItemMock(...args),
    updateItem: (...args: unknown[]) => updateItemMock(...args),
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

const validComponent = {
  id: "hero-banner",
  name: "Hero Banner",
  description: "Reusable hero block",
  category: "marketing",
  nodes: [validNode],
};

describe("useComponentActions", () => {
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

    const { useComponentActions } =
      await import("../../admin/features/Blocks/composables/useComponentActions");

    const actionsApi = useComponentActions();
    const result = await actionsApi.createComponent({
      name: "Hero Banner",
      nodes: [validNode],
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to create component",
    });
    expect(actionsApi.lastError.value).toBe("Failed to create component");
    expect(actionsApi.operating.value).toBe(false);
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to create component");
  });

  it("fails update when getItem returns a malformed component payload", async () => {
    getItemMock.mockResolvedValue({
      data: {
        id: "hero-banner",
        name: "Hero Banner",
      },
      error: null,
    });

    const { useComponentActions } =
      await import("../../admin/features/Blocks/composables/useComponentActions");

    const actionsApi = useComponentActions();
    const result = await actionsApi.updateComponent({
      slug: "hero-banner",
      name: "Updated Hero",
    });

    expect(result).toEqual({
      success: false,
      error: 'Failed to load component "hero-banner"',
    });
    expect(updateItemMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to update component");
  });

  it("fails duplicate when the source component payload is malformed", async () => {
    getItemMock.mockResolvedValue({
      data: {
        id: "hero-banner",
        name: "Hero Banner",
      },
      error: null,
    });

    const { useComponentActions } =
      await import("../../admin/features/Blocks/composables/useComponentActions");

    const actionsApi = useComponentActions();
    const result = await actionsApi.duplicateComponent("hero-banner");

    expect(result).toEqual({
      success: false,
      error: 'Failed to load component "hero-banner"',
    });
    expect(createItemMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to duplicate component",
    );
  });

  it("fails delete when deleteItem returns a malformed success payload", async () => {
    deleteItemMock.mockResolvedValue({
      data: {
        ok: true,
      },
      error: null,
    });

    const { useComponentActions } =
      await import("../../admin/features/Blocks/composables/useComponentActions");

    const actionsApi = useComponentActions();
    const result = await actionsApi.deleteComponent("hero-banner");

    expect(result).toEqual({
      success: false,
      error: "Failed to delete component",
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to delete component");
  });

  it("returns the updated component when updateItem passes validation", async () => {
    getItemMock.mockResolvedValue({
      data: validComponent,
      error: null,
    });
    updateItemMock.mockResolvedValue({
      data: {
        success: true,
        slug: "hero-banner",
      },
      error: null,
    });

    const { useComponentActions } =
      await import("../../admin/features/Blocks/composables/useComponentActions");

    const actionsApi = useComponentActions();
    const result = await actionsApi.updateComponent({
      slug: "hero-banner",
      name: "Updated Hero",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Updated Hero");
      expect(result.data.nodes).toHaveLength(1);
      expect(result.data.nodes[0]?.customClasses).toEqual([]);
    }
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Component "Updated Hero" updated',
    );
  });
});
