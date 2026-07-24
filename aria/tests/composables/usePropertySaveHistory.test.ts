import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedOperation = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

let lastOperation: CapturedOperation | null = null;

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

vi.mock("../../admin/features/History", () => ({
  useHistory: () => ({
    execute: executeMock,
  }),
}));

describe("usePropertySaveHistory", () => {
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
          error: error instanceof Error ? error : new Error("Unknown error"),
        };
      }
    });

  });

  it("executes local property mutations through history and supports undo callbacks", async () => {
    const { usePropertySaveHistory } =
      await import("../../admin/features/Core/composables/usePropertySaveHistory");

    const onRedo = vi.fn();
    const onUndo = vi.fn();
    const { executePropertySaveMutation } = usePropertySaveHistory();
    const result = await executePropertySaveMutation({
      metadata: {
        type: "update-node-props",
        description: "Update title",
        affectedNodeIds: ["node-1"],
      },
      target: {
        collection: "pages",
        id: "home",
        nodeId: "node-1",
      },
      updates: {
        props: { title: "Hello" },
      },
      restoreUpdates: {
        props: { title: "Before" },
      },
      breakpoint: "default",
      onRedo,
      onUndo,
    });

    expect(result).toEqual({ success: true });
    expect(onRedo).toHaveBeenCalledTimes(1);

    await lastOperation?.undo();

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("keeps structured media ownership in the local history payload", async () => {
    const { usePropertySaveHistory } =
      await import("../../admin/features/Core/composables/usePropertySaveHistory");

    const onRedo = vi.fn();
    const onUndo = vi.fn();
    const { executePropertySaveMutation } = usePropertySaveHistory();
    const result = await executePropertySaveMutation({
      metadata: {
        type: "update-node-props",
        description: "Select image variant",
        affectedNodeIds: ["node-1"],
      },
      target: {
        collection: "pages",
        id: "home",
        nodeId: "node-1",
      },
      updates: {
        props: { src: "/media/transform/hero-wide/1-revision" },
        metadata: {
          mediaReferences: {
            image: { mediaId: "media-hero", variantId: "hero-wide" },
          },
        },
      },
      restoreUpdates: {
        props: { src: "/uploads/hero.jpg" },
        metadata: {
          mediaReferences: {
            image: { mediaId: "media-hero", variantId: null },
          },
        },
      },
      breakpoint: "base",
      onRedo,
      onUndo,
    });

    expect(result).toEqual({ success: true });
    expect(lastOperation).not.toBeNull();
    expect(onRedo).toHaveBeenCalledTimes(1);

    await lastOperation?.undo();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid property save payloads before history executes", async () => {
    const { usePropertySaveHistory } =
      await import("../../admin/features/Core/composables/usePropertySaveHistory");

    const { executePropertySaveMutation } = usePropertySaveHistory();
    const result = await executePropertySaveMutation({
      metadata: {
        type: "update-node-props",
        description: "Bad update",
      },
      target: {
        collection: "pages",
        id: "home",
        nodeId: "node-1",
      },
      updates: {
        props: {
          title: (() => "nope") as unknown as string,
        },
      },
      restoreUpdates: {
        props: { title: "Before" },
      },
      breakpoint: "default",
    });

    expect(result.success).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("executes same-document batch mutations locally", async () => {
    const { usePropertySaveHistory } =
      await import("../../admin/features/Core/composables/usePropertySaveHistory");

    const onRedo = vi.fn();
    const onUndo = vi.fn();
    const { executePropertySaveBatchMutation } = usePropertySaveHistory();
    const result = await executePropertySaveBatchMutation({
      metadata: {
        type: "batch-nodes",
        description: "Update spacing",
        affectedNodeIds: ["node-1", "node-2"],
      },
      targets: [
        {
          target: {
            collection: "pages",
            id: "home",
            nodeId: "node-1",
          },
          updates: {
            styles: { padding: { base: "24px" } },
          },
          restoreUpdates: {
            styles: { padding: { base: "16px" } },
          },
        },
        {
          target: {
            collection: "pages",
            id: "home",
            nodeId: "node-2",
          },
          updates: {
            styles: { margin: { base: "12px" } },
          },
          restoreUpdates: {
            styles: { margin: { base: "8px" } },
          },
        },
      ],
      breakpoint: "base",
      onRedo,
      onUndo,
    });

    expect(result).toEqual({ success: true });
    expect(onRedo).toHaveBeenCalledTimes(1);

    await lastOperation?.undo();

    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
