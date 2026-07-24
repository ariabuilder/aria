import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedOperation = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

let lastOperation: CapturedOperation | null = null;

const executeMock = vi.fn();

describe("useStageLayoutHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOperation = null;

    executeMock.mockImplementation(async (operation: CapturedOperation) => {
      lastOperation = operation;
      await operation.redo();
      return { success: true, error: undefined };
    });
  });

  it("records layout selection changes through history and supports undo", async () => {
    const { useStageLayoutHistory } =
      await import("../../admin/features/Stage/composables/useStageLayoutHistory");

    const applyLayoutSelection = vi.fn(async () => {});
    const { recordLayoutSelectionChange } = useStageLayoutHistory({
      execute: executeMock,
    } as never);

    const result = await recordLayoutSelectionChange({
      previousLayout: "marketing-shell",
      nextLayout: "docs-shell",
      applyLayoutSelection,
    });

    expect(result).toEqual({ success: true });
    expect(applyLayoutSelection).toHaveBeenCalledTimes(1);
    expect(applyLayoutSelection).toHaveBeenCalledWith("docs-shell");

    await lastOperation?.undo();

    expect(applyLayoutSelection).toHaveBeenCalledTimes(2);
    expect(applyLayoutSelection).toHaveBeenLastCalledWith("marketing-shell");
  });

  it("rejects invalid layout metadata before executing history", async () => {
    const { useStageLayoutHistory } =
      await import("../../admin/features/Stage/composables/useStageLayoutHistory");

    const applyMetadata = vi.fn(async () => {});
    const { recordLayoutMetadataUpdate } = useStageLayoutHistory({
      execute: executeMock,
    } as never);

    const result = await recordLayoutMetadataUpdate({
      previousMetadata: undefined,
      nextMetadata: {
        slots: [{ name: "", required: true }],
      },
      applyMetadata,
    });

    expect(result.success).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
    expect(applyMetadata).not.toHaveBeenCalled();
  });
});
