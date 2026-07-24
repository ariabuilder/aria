import { ref, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuilderNode } from "../../lib/types/nodes";

const { toastSuccessMock, toastErrorMock, executeEditorMutationMock } =
  vi.hoisted(() => ({
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
    executeEditorMutationMock: vi.fn(),
  }));

vi.mock("vue-sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: vi.fn(),
}));

vi.mock(
  "../../admin/features/Core/composables/useEditorMutationHistory",
  () => ({
    useEditorMutationHistory: () => ({
      executeEditorMutation: executeEditorMutationMock,
    }),
  }),
);

function createNode(id: string, type = "section"): BuilderNode {
  return {
    id,
    type,
    props: {},
    styles: {},
    children: [],
  };
}

function nodeListRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

describe("useEditorMutationHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeEditorMutationMock.mockImplementation((_metadata, callbacks) => {
      callbacks.redo();
      return true;
    });
  });

  it("adds nested blocks only through the history helper redo path", async () => {
    const { useEditorMutationHandlers } =
      await import("../../admin/features/Core/composables/useEditorMutationHandlers");

    const parent = createNode("parent-1", "container");
    const child = createNode("child-1", "text");
    const pageBlocks = nodeListRef([parent]);
    const hasUnsavedChanges = ref(false);
    const focusNode = vi.fn();

    const handlers = useEditorMutationHandlers({
      pageBlocks,
      hasUnsavedChanges,
      history: { execute: vi.fn() } as never,
      nodeManipulation: {
        findNodeById: vi.fn(() => parent),
        findNodeToDelete: vi.fn(),
      } as never,
      nodeEventHandlers: {
        handleLayersReorderNode: vi.fn(),
      },
      focusNode,
    });

    handlers.handleAddBlock(child, "parent-1");

    expect(executeEditorMutationMock).toHaveBeenCalledTimes(1);
    expect(parent.children).toHaveLength(1);
    expect(parent.children?.[0]?.id).toBe("child-1");
    expect(focusNode).toHaveBeenCalledWith("child-1");
    expect(hasUnsavedChanges.value).toBe(true);
    expect(toastSuccessMock).toHaveBeenCalledWith("Added text block");
  });

  it("rejects invalid node prop payloads before mutating state", async () => {
    const { useEditorMutationHandlers } =
      await import("../../admin/features/Core/composables/useEditorMutationHandlers");

    const node = createNode("node-1", "text");
    const pageBlocks = nodeListRef([node]);
    const hasUnsavedChanges = ref(false);

    const handlers = useEditorMutationHandlers({
      pageBlocks,
      hasUnsavedChanges,
      history: { execute: vi.fn() } as never,
      nodeManipulation: {
        findNodeById: vi.fn(),
        findNodeToDelete: vi.fn(() => ({ node })),
      } as never,
      nodeEventHandlers: {
        handleLayersReorderNode: vi.fn(),
      },
      focusNode: vi.fn(),
    });

    handlers.handleNodePropUpdate("node-1", "content", Symbol("bad"));

    expect(executeEditorMutationMock).not.toHaveBeenCalled();
    expect((node.props as Record<string, unknown>).content).toBeUndefined();
    expect(hasUnsavedChanges.value).toBe(false);
  });
});
