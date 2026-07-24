import { ref, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signalHighlightNodeMock, signalScrollToNodeMock } = vi.hoisted(() => ({
  signalHighlightNodeMock: vi.fn(),
  signalScrollToNodeMock: vi.fn(),
}));

vi.mock("../../../admin/features/Core", () => ({
  useCanvasInteractionBridge: () => ({
    signalHighlightNode: signalHighlightNodeMock,
    signalScrollToNode: signalScrollToNodeMock,
  }),
}));

import { useLayerUiActions } from "../../../admin/features/Layers/composables/useLayerUiActions";
import type { BuilderNode } from "../../../lib/types/nodes";

function createNode(
  id: string,
  type: string,
  children: BuilderNode[] = [],
): BuilderNode {
  return {
    id,
    type,
    props: {},
    styles: {},
    children,
  };
}

function blocksRef(nodes: BuilderNode[] | undefined): Ref<BuilderNode[] | undefined> {
  return ref(nodes as unknown) as Ref<BuilderNode[] | undefined>;
}

describe("useLayerUiActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears rename mode when selecting a different node", () => {
    const editingNodeId = ref<string | null>("node-1");
    const focusNode = vi.fn();
    const toggleSelection = vi.fn();

    const actions = useLayerUiActions({
      focusedNodeId: ref<string | null>("node-1"),
      focusNode,
      toggleSelection,
      hoveredNodeId: ref<string | null>(null),
      editingNodeId,
      expandedNodes: ref(new Set<string>()),
      hasChildren: () => false,
      toggleExpand: vi.fn(),
      blocks: blocksRef([]),
      updateBlocksWithHistory: vi.fn(),
      emitOpenPicker: vi.fn(),
      selectionAnchorNodeId: ref<string | null>(null),
      replaceSelection: vi.fn(),
      getVisibleNodeIds: vi.fn(),
    });

    actions.handleSelectNode(createNode("node-2", "Text"));

    expect(editingNodeId.value).toBeNull();
    expect(focusNode).toHaveBeenCalledWith("node-2");
    expect(toggleSelection).not.toHaveBeenCalled();
    expect(signalScrollToNodeMock).toHaveBeenCalledWith({ nodeId: "node-2" });
  });

  it("still toggles expansion when clicking the already focused parent", () => {
    const toggleExpand = vi.fn();
    const actions = useLayerUiActions({
      focusedNodeId: ref<string | null>("node-1"),
      focusNode: vi.fn(),
      toggleSelection: vi.fn(),
      hoveredNodeId: ref<string | null>(null),
      editingNodeId: ref<string | null>(null),
      expandedNodes: ref(new Set<string>()),
      hasChildren: () => true,
      toggleExpand,
      blocks: blocksRef([]),
      updateBlocksWithHistory: vi.fn(),
      emitOpenPicker: vi.fn(),
      selectionAnchorNodeId: ref<string | null>(null),
      replaceSelection: vi.fn(),
      getVisibleNodeIds: vi.fn(),
    });

    actions.handleSelectNode(createNode("node-1", "Container"));

    expect(toggleExpand).toHaveBeenCalledWith("node-1");
    expect(signalScrollToNodeMock).not.toHaveBeenCalled();
  });

  it("does not toggle expansion when slot sync changes active layout slot", () => {
    const toggleExpand = vi.fn();
    const focusNode = vi.fn();
    const actions = useLayerUiActions({
      focusedNodeId: ref<string | null>("node-1"),
      focusNode,
      toggleSelection: vi.fn(),
      hoveredNodeId: ref<string | null>(null),
      editingNodeId: ref<string | null>(null),
      expandedNodes: ref(new Set<string>()),
      hasChildren: () => true,
      toggleExpand,
      blocks: blocksRef([]),
      updateBlocksWithHistory: vi.fn(),
      emitOpenPicker: vi.fn(),
      activeSlotName: ref("main"),
      nodeLayoutSlotName: () => "header",
      onBeforeSelectNode: () => ({ slotChanged: true, slotName: "header" }),
      selectionAnchorNodeId: ref<string | null>(null),
      replaceSelection: vi.fn(),
      getVisibleNodeIds: vi.fn(),
    });

    actions.handleSelectNode(createNode("node-1", "Container"));

    expect(toggleExpand).not.toHaveBeenCalled();
    expect(focusNode).toHaveBeenCalledWith("node-1");
    expect(signalScrollToNodeMock).toHaveBeenCalledWith({ nodeId: "node-1" });
  });

  it("toggles additive selection on meta-click", () => {
    const focusNode = vi.fn();
    const toggleSelection = vi.fn();
    const toggleExpand = vi.fn();
    const actions = useLayerUiActions({
      focusedNodeId: ref<string | null>("node-1"),
      focusNode,
      toggleSelection,
      hoveredNodeId: ref<string | null>(null),
      editingNodeId: ref<string | null>(null),
      expandedNodes: ref(new Set<string>()),
      hasChildren: () => true,
      toggleExpand,
      blocks: blocksRef([]),
      updateBlocksWithHistory: vi.fn(),
      emitOpenPicker: vi.fn(),
      selectionAnchorNodeId: ref<string | null>(null),
      replaceSelection: vi.fn(),
      getVisibleNodeIds: vi.fn(),
    });

    actions.handleSelectNode({
      node: createNode("node-1", "Container"),
      triggerGesture: {
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      },
    });

    expect(toggleSelection).toHaveBeenCalledWith("node-1");
    expect(focusNode).not.toHaveBeenCalled();
    expect(toggleExpand).not.toHaveBeenCalled();
    expect(signalScrollToNodeMock).toHaveBeenCalledWith({ nodeId: "node-1" });
  });
});
