import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteItemMock, createItemMock, executeMock } = vi.hoisted(() => ({
  deleteItemMock: vi.fn(),
  createItemMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    deleteItem: (...args: unknown[]) => deleteItemMock(...args),
    createItem: (...args: unknown[]) => createItemMock(...args),
  },
}));

vi.mock("../../../../admin/features/History", () => ({
  useHistory: () => ({
    execute: executeMock,
  }),
}));

vi.mock("@/lib/utils/logger", () => ({
  log: vi.fn(),
}));

describe("useStudioCrudHistory recordDeleteItemsBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    deleteItemMock.mockImplementation(async ({ slug: _slug }: { slug: string }) => ({
      data: { success: true },
      error: null,
    }));
    createItemMock.mockResolvedValue({
      data: { success: true, slug: "restored" },
      error: null,
    });
    executeMock.mockImplementation(async (operation) => {
      await operation.redo();
      return { success: true };
    });
  });

  it("deletes all items in one history entry and refreshes once", async () => {
    const refresh = vi.fn(async () => undefined);
    const { useStudioCrudHistory } =
      await import("../../../../admin/features/Studio/composer/composables/useStudioCrudHistory");

    const { recordDeleteItemsBatch } = useStudioCrudHistory();
    const result = await recordDeleteItemsBatch({
      type: "delete-pages-batch",
      description: "Delete 2 pages",
      collection: "pages",
      items: [
        {
          slug: "alpha",
          restoreData: {
            id: "alpha",
            slug: "alpha",
            title: "Alpha",
            nodes: [],
            settings: {},
            status: "draft",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        },
        {
          slug: "beta",
          restoreData: {
            id: "beta",
            slug: "beta",
            title: "Beta",
            nodes: [],
            settings: {},
            status: "draft",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      ],
      refresh,
    });

    expect(result).toEqual({
      succeeded: 2,
      failed: 0,
      errors: [],
    });
    expect(deleteItemMock).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "delete-pages-batch",
        description: "Delete 2 pages",
      }),
    );
  });

  it("records partial failures without aborting successful deletes", async () => {
    deleteItemMock.mockImplementation(async ({ slug }: { slug: string }) => {
      if (slug === "broken") {
        return {
          data: { success: false, error: { message: "Delete failed" } },
          error: null,
        };
      }

      return {
        data: { success: true },
        error: null,
      };
    });

    const refresh = vi.fn(async () => undefined);
    const { useStudioCrudHistory } =
      await import("../../../../admin/features/Studio/composer/composables/useStudioCrudHistory");

    const { recordDeleteItemsBatch } = useStudioCrudHistory();
    const result = await recordDeleteItemsBatch({
      type: "delete-components-batch",
      description: "Delete 2 components",
      collection: "components",
      items: [
        {
          slug: "hero",
          restoreData: {
            id: "hero",
            name: "Hero",
            nodes: [],
            settings: {},
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        },
        {
          slug: "broken",
          restoreData: {
            id: "broken",
            name: "Broken",
            nodes: [],
            settings: {},
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      ],
      refresh,
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual(["broken: Delete failed"]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
