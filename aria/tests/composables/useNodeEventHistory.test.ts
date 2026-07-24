import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedOperation = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  affectedNodeIds?: string[];
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

describe("useNodeEventHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOperation = null;

    executeMock.mockImplementation(async (operation: CapturedOperation) => {
      lastOperation = operation;
      await operation.redo();
      return { success: true, error: undefined };
    });
  });

  it("executes validated node history operations through the shared history runtime", async () => {
    const { useNodeEventHistory } =
      await import("../../admin/features/Nodes/events/shared/nodeEventHistory");

    const redo = vi.fn(async () => undefined);
    const undo = vi.fn(async () => undefined);
    const { executeNodeEventOperation } = useNodeEventHistory();

    const result = await executeNodeEventOperation(
      {
        type: "move-node",
        description: "Move hero below intro",
        affectedNodeIds: ["hero"],
      },
      {
        redo,
        undo,
      },
    );

    expect(result).toEqual({ success: true });
    expect(redo).toHaveBeenCalledTimes(1);
    expect(lastOperation?.affectedNodeIds).toEqual(["hero"]);

    await lastOperation?.undo();

    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid node history metadata before executing history", async () => {
    const { useNodeEventHistory } =
      await import("../../admin/features/Nodes/events/shared/nodeEventHistory");

    const { executeNodeEventOperation } = useNodeEventHistory();

    const result = await executeNodeEventOperation(
      {
        type: "move-node",
        description: "",
      },
      {
        redo: async () => undefined,
        undo: async () => undefined,
      },
    );

    expect(result.success).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
  });
});
