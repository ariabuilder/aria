import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedOperation = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  group?: {
    key: string;
    windowMs?: number;
  };
};

let lastOperation: CapturedOperation | null = null;

const executeMock = vi.fn();

describe("useLayerReorderHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOperation = null;

    executeMock.mockImplementation(async (operation: CapturedOperation) => {
      lastOperation = operation;
      await operation.redo();
      return { success: true, error: undefined };
    });
  });

  it("records layer reorder history with undo support and grouping metadata", async () => {
    const { useLayerReorderHistory } =
      await import("../../admin/features/Layers/composables/useLayerReorderHistory");

    const applyBlocks = vi.fn(async () => {});
    const { recordLayerReorder } = useLayerReorderHistory({
      execute: executeMock,
    } as never);

    const result = await recordLayerReorder({
      previousBlocks: [
        {
          id: "a",
          type: "Text",
          props: {},
          styles: {},
          children: [],
        },
      ],
      nextBlocks: [
        {
          id: "b",
          type: "Text",
          props: {},
          styles: {},
          children: [],
        },
      ],
      description: "Move block after hero",
      itemType: "page",
      itemSlug: "landing",
      applyBlocks,
    });

    expect(result).toEqual({ success: true });
    expect(applyBlocks).toHaveBeenCalledTimes(1);
    expect(applyBlocks).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "b",
        type: "Text",
        props: {},
        styles: {},
        children: [],
      }),
    ]);
    expect(lastOperation?.group).toEqual({
      key: "layers-reorder:page:landing",
      windowMs: 900,
    });

    await lastOperation?.undo();

    expect(applyBlocks).toHaveBeenCalledTimes(2);
    expect(applyBlocks).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: "a",
        type: "Text",
        props: {},
        styles: {},
        children: [],
      }),
    ]);
  });

  it("rejects invalid block payloads before executing history", async () => {
    const { useLayerReorderHistory } =
      await import("../../admin/features/Layers/composables/useLayerReorderHistory");

    const applyBlocks = vi.fn(async () => {});
    const { recordLayerReorder } = useLayerReorderHistory({
      execute: executeMock,
    } as never);

    const result = await recordLayerReorder({
      previousBlocks: [],
      nextBlocks: [
        {
          type: "Text",
        },
      ] as never,
      description: "Move block after hero",
      itemType: "page",
      itemSlug: "landing",
      applyBlocks,
    });

    expect(result.success).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
    expect(applyBlocks).not.toHaveBeenCalled();
  });
});
