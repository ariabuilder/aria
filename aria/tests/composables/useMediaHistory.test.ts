import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedOperation = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

let lastOperation: CapturedOperation | null = null;

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

vi.mock("../../admin/features/History/composables/useHistory", () => ({
  useHistory: () => ({
    execute: executeMock,
  }),
}));

describe("useMediaHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOperation = null;

    executeMock.mockImplementation(async (operation: CapturedOperation) => {
      lastOperation = operation;
      await operation.redo();
      return { success: true, error: undefined };
    });
  });

  it("records media history through the shared helper and supports undo", async () => {
    const { useMediaHistory } =
      await import("../../admin/features/Studio/media/composables/useMediaHistory");

    const onRedo = vi.fn();
    const onUndo = vi.fn();
    const { executeMediaHistory } = useMediaHistory();

    const result = await executeMediaHistory({
      metadata: {
        type: "media-rename",
        description: "Rename asset",
        affectedNodeIds: ["uploads/logo.png"],
      },
      redo: onRedo,
      undo: onUndo,
    });

    expect(result).toEqual({ success: true });
    expect(onRedo).toHaveBeenCalledTimes(1);

    await lastOperation?.undo();

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid media history metadata before executing history", async () => {
    const { useMediaHistory } =
      await import("../../admin/features/Studio/media/composables/useMediaHistory");

    const { recordMediaEvent } = useMediaHistory();
    const result = await recordMediaEvent({
      type: "media-rename",
      description: "",
    });

    expect(result.success).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
  });
});
