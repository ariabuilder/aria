import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("useEditorMutationHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeMock.mockResolvedValue({ success: true, error: undefined });
  });

  it("records validated editor mutation metadata through history", async () => {
    const { useEditorMutationHistory } =
      await import("../../admin/features/Core/composables/useEditorMutationHistory");

    const undo = vi.fn();
    const redo = vi.fn();
    const { executeEditorMutation } = useEditorMutationHistory({
      execute: executeMock,
    } as never);

    const executed = executeEditorMutation(
      {
        type: "insert-node",
        description: "Add section block",
        affectedNodeIds: ["section-1"],
      },
      { undo, redo },
    );

    expect(executed).toBe(true);
    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "insert-node",
        description: "Add section block",
        affectedNodeIds: ["section-1"],
        undo,
        redo,
      }),
    );
  });

  it("rejects invalid editor mutation metadata before history execution", async () => {
    const { useEditorMutationHistory } =
      await import("../../admin/features/Core/composables/useEditorMutationHistory");

    const { executeEditorMutation } = useEditorMutationHistory({
      execute: executeMock,
    } as never);

    const executed = executeEditorMutation(
      {
        type: "insert-node",
        description: "",
      },
      { undo: vi.fn(), redo: vi.fn() },
    );

    expect(executed).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[EditorMutation] Invalid history metadata",
      expect.objectContaining({ issues: expect.any(Array) }),
    );
  });
});
