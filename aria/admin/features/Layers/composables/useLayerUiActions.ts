import type { Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type { LayerSelectRequest } from "../types";
import { useCanvasInteractionBridge } from "../../Core";

function isLayerSelectRequest(
  selection: BuilderNode | LayerSelectRequest,
): selection is LayerSelectRequest {
  return (
    typeof selection === "object" &&
    selection !== null &&
    "node" in selection &&
    !("type" in selection)
  );
}

interface FocusNode {
  (nodeId: string | null): void;
}

export interface LayerNodeSelectSyncResult {
  slotChanged: boolean;
  slotName?: string;
}

export interface UseLayerUiActionsOptions {
  focusedNodeId: Ref<string | null>;
  focusNode: FocusNode;
  toggleSelection: (nodeId: string) => void;
  hoveredNodeId: Ref<string | null>;
  editingNodeId: Ref<string | null>;
  expandedNodes: Ref<Set<string>>;
  hasChildren: (node: BuilderNode) => boolean;
  toggleExpand: (nodeId: string, event?: Event) => void;
  blocks: Ref<BuilderNode[] | undefined>;
  updateBlocksWithHistory: (
    newBlocks: BuilderNode[],
    description: string,
  ) => void;
  emitOpenPicker: (slotName: string) => void;
  activeSlotName?: Ref<string>;
  onBeforeSelectNode?: (nodeId: string) => LayerNodeSelectSyncResult;
  nodeLayoutSlotName?: (nodeId: string) => string | undefined;
  /** Anchor node ID used as range-start for shift-click selection */
  selectionAnchorNodeId: import("vue").Ref<string | null>;
  /** Replace entire selection set (from Beacon) */
  replaceSelection: (
    nodeIds: string[],
    options?: {
      primarySelectedNodeId?: string | null;
      selectionAnchorNodeId?: string | null;
    },
  ) => void;
  /** Flat ordered list of visible node IDs for range computation */
  getVisibleNodeIds: () => string[];
}

export function useLayerUiActions(options: UseLayerUiActionsOptions) {
  const {
    focusedNodeId,
    focusNode,
    toggleSelection,
    hoveredNodeId,
    editingNodeId,
    hasChildren,
    toggleExpand,
    blocks,
    updateBlocksWithHistory,
    emitOpenPicker,
    activeSlotName,
    onBeforeSelectNode,
    nodeLayoutSlotName,
    selectionAnchorNodeId,
    replaceSelection,
    getVisibleNodeIds,
  } = options;
  const { signalHighlightNode, signalScrollToNode } =
    useCanvasInteractionBridge();

  const handleSelectNode = (
    selection: BuilderNode | LayerSelectRequest,
  ): void => {
    const node: BuilderNode = isLayerSelectRequest(selection)
      ? selection.node
      : selection;
    const triggerGesture: LayerSelectRequest["triggerGesture"] =
      isLayerSelectRequest(selection) ? selection.triggerGesture : undefined;
    const isAdditiveSelection =
      triggerGesture?.metaKey === true || triggerGesture?.ctrlKey === true;
    const isRangeSelection = triggerGesture?.shiftKey === true;

    if (editingNodeId.value && editingNodeId.value !== node.id) {
      editingNodeId.value = null;
    }

    if (isRangeSelection) {
      const visibleIds = getVisibleNodeIds();
      const anchorId = selectionAnchorNodeId.value;

      if (anchorId && visibleIds.includes(anchorId)) {
        const anchorIndex = visibleIds.indexOf(anchorId);
        const clickedIndex = visibleIds.indexOf(node.id);
        if (anchorIndex !== -1 && clickedIndex !== -1) {
          const start = Math.min(anchorIndex, clickedIndex);
          const end = Math.max(anchorIndex, clickedIndex);
          const rangeIds = visibleIds.slice(start, end + 1);

          replaceSelection(rangeIds, {
            primarySelectedNodeId: node.id,
            selectionAnchorNodeId: anchorId,
          });
          signalScrollToNode({ nodeId: node.id });
          return;
        }
      }

      focusNode(node.id);
      signalScrollToNode({ nodeId: node.id });
      return;
    }

    if (isAdditiveSelection) {
      toggleSelection(node.id);
      signalScrollToNode({ nodeId: node.id });
      return;
    }

    const layoutSlotName = nodeLayoutSlotName?.(node.id);
    const activeSlotMismatch =
      Boolean(layoutSlotName && activeSlotName) &&
      layoutSlotName !== activeSlotName?.value;

    const syncResult = onBeforeSelectNode?.(node.id) ?? { slotChanged: false };

    const alreadyFocused = focusedNodeId.value === node.id;
    const shouldToggleExpand =
      alreadyFocused &&
      hasChildren(node) &&
      !syncResult.slotChanged &&
      !activeSlotMismatch;

    if (shouldToggleExpand) {
      toggleExpand(node.id);
      return;
    }

    focusNode(node.id);
    signalScrollToNode({ nodeId: node.id });
  };

  const handleNodeHover = (node: BuilderNode | undefined): void => {
    if (!node) return;
    signalHighlightNode({ nodeId: node.id });
    hoveredNodeId.value = node.id;
  };

  const handleNodeLeave = (): void => {
    signalHighlightNode({ nodeId: null });
    hoveredNodeId.value = null;
  };

  const handleRenameNode = (node: BuilderNode, newLabel: string): void => {
    if (!node.metadata) {
      node.metadata = {};
    }

    node.metadata.label = newLabel;
    editingNodeId.value = null;

    if (blocks.value) {
      updateBlocksWithHistory(blocks.value, `Rename node to "${newLabel}"`);
    }
  };

  const handleOpenPicker = (slotName: string): void => {
    options.expandedNodes.value.add(slotName);
    options.expandedNodes.value = new Set(options.expandedNodes.value);
    emitOpenPicker(slotName);
  };

  const handleEditStart = (id: string): void => {
    editingNodeId.value = id;
  };

  const handleEditCancel = (): void => {
    editingNodeId.value = null;
  };

  return {
    handleSelectNode,
    handleNodeHover,
    handleNodeLeave,
    handleRenameNode,
    handleOpenPicker,
    handleEditStart,
    handleEditCancel,
  };
}
