import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedOperation = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

let lastOperation: CapturedOperation | null = null;

const { executeMock, mutateMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock("../../admin/features/History", () => ({
  useHistory: () => ({
    execute: executeMock,
  }),
}));

vi.mock("astro:actions", () => ({
  actions: {
    mutate: mutateMock,
  },
}));

describe("useNodeMutationHistory", () => {
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

    mutateMock.mockResolvedValue({
      data: { version: "v2" },
      error: null,
    });
  });

  it("records prop mutations through history and supports undo", async () => {
    const { useNodeMutationHistory } =
      await import("../../admin/features/Inspector/composables/useNodeMutationHistory");

    const { executeNodeMutation } = useNodeMutationHistory();
    const result = await executeNodeMutation({
      metadata: {
        type: "update-node-props",
        description: "Update title",
        affectedNodeIds: ["node-1"],
      },
      target: {
        path: { collection: "pages", id: "home", version: "v1" },
        nodeId: "node-1",
      },
      updates: {
        props: { title: "Hello" },
      },
      restoreUpdates: {
        props: { title: "Before" },
      },
      breakpoint: "default",
    });

    expect(result).toEqual({ success: true });
    expect(mutateMock).not.toHaveBeenCalled();

    await lastOperation?.undo();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("records metadata mutations through history and supports undo", async () => {
    const { useNodeMutationHistory } =
      await import("../../admin/features/Inspector/composables/useNodeMutationHistory");

    const nextMetadata = {
      contentEditor: {
        fields: {
          text: {
            locked: true,
          },
        },
      },
    };
    const previousMetadata = {
      contentEditor: {
        fields: {
          text: {
            locked: false,
          },
        },
      },
    };

    const { executeNodeMutation } = useNodeMutationHistory();
    const result = await executeNodeMutation({
      metadata: {
        type: "update-node-props",
        description: "Lock content detail field",
        affectedNodeIds: ["node-1"],
      },
      target: {
        path: { collection: "pages", id: "home", version: "v1" },
        nodeId: "node-1",
      },
      updates: {
        metadata: nextMetadata,
      },
      restoreUpdates: {
        metadata: previousMetadata,
      },
      breakpoint: "default",
    });

    expect(result).toEqual({ success: true });
    expect(mutateMock).not.toHaveBeenCalled();

    await lastOperation?.undo();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("records CMS data source mutations through history and supports undo", async () => {
    const { useNodeMutationHistory } =
      await import("../../admin/features/Inspector/composables/useNodeMutationHistory");

    const nextDataSource = {
      type: "collection" as const,
      collection: "blog",
      mode: "list" as const,
      bindings: {
        text: "blog.title",
      },
    };
    const previousDataSource = {
      type: "collection" as const,
      collection: "blog",
      mode: "list" as const,
      bindings: {
        text: "blog.slug",
      },
    };

    const { executeNodeMutation } = useNodeMutationHistory();
    const result = await executeNodeMutation({
      metadata: {
        type: "update-node-props",
        description: "Bind text to CMS title",
        affectedNodeIds: ["node-1"],
      },
      target: {
        path: { collection: "pages", id: "home", version: "v1" },
        nodeId: "node-1",
      },
      updates: {
        dataSource: nextDataSource,
      },
      restoreUpdates: {
        dataSource: previousDataSource,
      },
      breakpoint: "default",
    });

    expect(result).toEqual({ success: true });
    expect(mutateMock).not.toHaveBeenCalled();

    await lastOperation?.undo();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("reconciles local state after the initial mutation, undo, and redo", async () => {
    const { useNodeMutationHistory } =
      await import("../../admin/features/Inspector/composables/useNodeMutationHistory");

    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const { executeNodeMutation } = useNodeMutationHistory();
    const result = await executeNodeMutation({
      metadata: {
        type: "update-node-props",
        description: "Clear CMS binding for text",
        affectedNodeIds: ["node-1"],
      },
      target: {
        path: { collection: "pages", id: "home", version: "v1" },
        nodeId: "node-1",
      },
      updates: { dataSource: null },
      restoreUpdates: {
        dataSource: {
          type: "collection",
          collection: "blog",
          mode: "single",
          bindings: { text: "blog.title" },
        },
      },
      breakpoint: "default",
      callbacks: { onUndo, onRedo },
    });

    expect(result.success).toBe(true);
    expect(onRedo).toHaveBeenCalledTimes(1);

    await lastOperation?.undo();
    expect(onUndo).toHaveBeenCalledTimes(1);

    await lastOperation?.redo();
    expect(onRedo).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid prop payloads before history executes", async () => {
    const { useNodeMutationHistory } =
      await import("../../admin/features/Inspector/composables/useNodeMutationHistory");

    const { executeNodeMutation } = useNodeMutationHistory();
    const result = await executeNodeMutation({
      metadata: {
        type: "update-node-props",
        description: "Bad update",
      },
      target: {
        path: { collection: "pages", id: "home" },
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
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("does not depend on mutation action responses", async () => {
    const { useNodeMutationHistory } =
      await import("../../admin/features/Inspector/composables/useNodeMutationHistory");

    mutateMock.mockResolvedValueOnce({
      data: {},
      error: null,
    });

    const { executeNodeMutation } = useNodeMutationHistory();
    const result = await executeNodeMutation({
      metadata: {
        type: "update-node-props",
        description: "Update title",
        affectedNodeIds: ["node-1"],
      },
      target: {
        path: { collection: "pages", id: "home", version: "v1" },
        nodeId: "node-1",
      },
      updates: {
        props: { title: "Hello" },
      },
      restoreUpdates: {
        props: { title: "Before" },
      },
      breakpoint: "default",
    });

    expect(result).toEqual({ success: true });
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
