import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedOperation = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

let lastOperation: CapturedOperation | null = null;

const { executeMock, createItemMock, deleteItemMock, updateItemMock } =
  vi.hoisted(() => ({
    executeMock: vi.fn(),
    createItemMock: vi.fn(),
    deleteItemMock: vi.fn(),
    updateItemMock: vi.fn(),
  }));

vi.mock("../../admin/features/History", () => ({
  useHistory: () => ({
    execute: executeMock,
  }),
}));

vi.mock("astro:actions", () => ({
  actions: {
    createItem: createItemMock,
    deleteItem: deleteItemMock,
    updateItem: updateItemMock,
  },
}));

describe("useStudioCrudHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOperation = null;

    executeMock.mockImplementation(async (operation: CapturedOperation) => {
      lastOperation = operation;
      try {
        await operation.redo();
        return { success: true, error: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    });

    createItemMock.mockResolvedValue({
      error: null,
      data: { success: true, slug: "landing" },
    });
    deleteItemMock.mockResolvedValue({ error: null, data: { success: true } });
    updateItemMock.mockResolvedValue({
      error: null,
      data: { success: true, slug: "marketing-shell" },
    });
  });

  it("creates items through history and supports undo", async () => {
    const { useStudioCrudHistory } =
      await import("../../admin/features/Studio/composer/composables/useStudioCrudHistory");

    const refresh = vi.fn(async () => {});
    const { recordCreateItem } = useStudioCrudHistory();

    const createdSlug = await recordCreateItem({
      type: "create-page",
      description: 'Create page "Landing"',
      collection: "pages",
      slug: "landing",
      data: {
        id: "landing",
        slug: "landing",
        title: "Landing",
      },
      refresh,
    });

    expect(createdSlug).toBe("landing");
    expect(createItemMock).toHaveBeenCalledWith({
      collection: "pages",
      slug: "landing",
      data: {
        id: "landing",
        slug: "landing",
        title: "Landing",
      },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(lastOperation).not.toBeNull();

    await lastOperation?.undo();

    expect(deleteItemMock).toHaveBeenCalledWith({
      collection: "pages",
      slug: "landing",
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid create history input before executing history", async () => {
    const { useStudioCrudHistory } =
      await import("../../admin/features/Studio/composer/composables/useStudioCrudHistory");

    const refresh = vi.fn(async () => {});
    const { recordCreateItem } = useStudioCrudHistory();

    const createdSlug = await recordCreateItem({
      type: "create-page",
      description: "",
      collection: "pages",
      slug: "",
      data: {
        id: "invalid",
      },
      refresh,
    });

    expect(createdSlug).toBeNull();
    expect(executeMock).not.toHaveBeenCalled();
    expect(createItemMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("fails create history when createItem returns malformed data", async () => {
    const { useStudioCrudHistory } =
      await import("../../admin/features/Studio/composer/composables/useStudioCrudHistory");

    createItemMock.mockResolvedValue({
      error: null,
      data: { slug: "landing" },
    });

    const refresh = vi.fn(async () => {});
    const { recordCreateItem } = useStudioCrudHistory();

    const createdSlug = await recordCreateItem({
      type: "create-page",
      description: 'Create page "Landing"',
      collection: "pages",
      slug: "landing",
      data: {
        id: "landing",
        slug: "landing",
        title: "Landing",
      },
      refresh,
    });

    expect(createdSlug).toBeNull();
    expect(createItemMock).toHaveBeenCalledTimes(1);
    expect(deleteItemMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("fails create history when createItem returns handler failure data", async () => {
    const { useStudioCrudHistory } =
      await import("../../admin/features/Studio/composer/composables/useStudioCrudHistory");

    createItemMock.mockResolvedValue({
      error: null,
      data: {
        success: false,
        error: {
          message: "Page already exists",
        },
      },
    });

    const refresh = vi.fn(async () => {});
    const { recordCreateItem } = useStudioCrudHistory();

    const createdSlug = await recordCreateItem({
      type: "create-page",
      description: 'Create page "Landing"',
      collection: "pages",
      slug: "landing",
      data: {
        id: "landing",
        slug: "landing",
        title: "Landing",
      },
      refresh,
    });

    expect(createdSlug).toBeNull();
    expect(createItemMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("updates layout metadata through history and runs sync callbacks", async () => {
    const { useStudioCrudHistory } =
      await import("../../admin/features/Studio/composer/composables/useStudioCrudHistory");

    const refresh = vi.fn(async () => {});
    const afterRedo = vi.fn(async () => {});
    const afterUndo = vi.fn(async () => {});
    const { recordUpdateItem } = useStudioCrudHistory();

    const updated = await recordUpdateItem({
      type: "update-layout-metadata",
      description: 'Update layout "marketing-shell"',
      collection: "layouts",
      slug: "marketing-shell",
      data: {
        id: "marketing-shell",
        name: "Marketing Shell",
        slots: [],
      },
      restoreData: {
        id: "marketing-shell",
        name: "Marketing Shell Old",
        slots: [],
      },
      refresh,
      afterRedo,
      afterUndo,
    });

    expect(updated).toBe(true);
    expect(updateItemMock).toHaveBeenCalledWith({
      collection: "layouts",
      slug: "marketing-shell",
      data: {
        id: "marketing-shell",
        name: "Marketing Shell",
        slots: [],
      },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(afterRedo).toHaveBeenCalledTimes(1);

    await lastOperation?.undo();

    expect(updateItemMock).toHaveBeenLastCalledWith({
      collection: "layouts",
      slug: "marketing-shell",
      data: {
        id: "marketing-shell",
        name: "Marketing Shell Old",
        slots: [],
      },
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(afterUndo).toHaveBeenCalledTimes(1);
  });

  it("accepts restore-page-version metadata for executeStudioOperation", async () => {
    const { useStudioCrudHistory } =
      await import("../../admin/features/Studio/composer/composables/useStudioCrudHistory");

    const redo = vi.fn(async () => {});
    const undo = vi.fn(async () => {});
    const { executeStudioOperation } = useStudioCrudHistory();

    const succeeded = await executeStudioOperation(
      {
        type: "restore-page-version",
        description: "Restore page to v2",
      },
      { redo, undo },
    );

    expect(succeeded).toBe(true);
    expect(redo).toHaveBeenCalledTimes(1);

    await lastOperation?.undo();

    expect(undo).toHaveBeenCalledTimes(1);
  });
});
