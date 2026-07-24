import { nextTick, type Ref } from "vue";
import type { BuilderNode, LayoutDSL } from "../../../../lib/types/nodes";
import type { LayoutWithSlotsLike } from "../../../../lib/layouts/slotEditing";
import {
  syncLayoutSlotOnNodeSelect,
  useCanvasInteractionBridge,
  useCanvasSignalBridge,
} from "../../Core";
import type { useEditorNodeRegistry } from "../../Core/composables/useEditorNodeRegistry";
import type { UseActiveLayoutSlotReturn } from "../../Core/composables/useActiveLayoutSlot";

interface FocusNode {
  (nodeId: string | null): void;
}

type EditorNodeRegistryApi = ReturnType<typeof useEditorNodeRegistry>;

export interface UseLayerCanvasSignalsOptions {
  blocks: Ref<BuilderNode[] | undefined>;
  currentPageNodes: Ref<BuilderNode[]>;
  currentLayout: Ref<LayoutWithSlotsLike | LayoutDSL | null | undefined>;
  hoveredNodeId: Ref<string | null>;
  findNodeById: (nodes: BuilderNode[], targetId: string) => BuilderNode | null;
  expandAncestors: (nodeId: string) => void;
  focusNode: FocusNode;
  toggleSelection: (nodeId: string) => void;
  clearSelection: () => void;
  editorNodeRegistry?: EditorNodeRegistryApi | null;
  activeLayoutSlot?: UseActiveLayoutSlotReturn | null;
}

export function useLayerCanvasSignals(options: UseLayerCanvasSignalsOptions) {
  const {
    blocks,
    currentPageNodes,
    currentLayout,
    hoveredNodeId,
    findNodeById,
    expandAncestors,
    focusNode,
    toggleSelection,
    clearSelection,
    editorNodeRegistry,
    activeLayoutSlot,
  } = options;
  const { onHoverNode, onSelectNode, signalGetComponentWrapper } =
    useCanvasInteractionBridge();
  const { onComponentWrapperResponse } = useCanvasSignalBridge();

  const resolveNode = (nodeId: string): BuilderNode | null => {
    if (editorNodeRegistry) {
      const fromRegistry = editorNodeRegistry.findNode(nodeId);
      if (fromRegistry) {
        return fromRegistry;
      }
    }

    return findNodeById(currentPageNodes.value, nodeId);
  };

  const nodeExistsInEditorTrees = (nodeId: string): boolean => {
    if (resolveNode(nodeId)) {
      return true;
    }

    const search = (nodes: BuilderNode[]): boolean => {
      for (const node of nodes) {
        if (node.id === nodeId) return true;

        const isComponent = node.type === "Component";
        if (!isComponent && node.children && node.children.length > 0) {
          if (search(node.children)) return true;
        }
      }
      return false;
    };

    return search(blocks.value || []);
  };

  onHoverNode((payload) => {
    const nodeId = payload?.nodeId || null;

    if (nodeId && !nodeExistsInEditorTrees(nodeId)) {
      signalGetComponentWrapper({ nodeId });
    } else {
      hoveredNodeId.value = nodeId;
    }
  });

  onComponentWrapperResponse((payload) => {
    hoveredNodeId.value = payload.wrapperId || null;
  });

  onSelectNode((payload) => {
    const nodeId = payload?.nodeId;
    const isAdditiveSelection =
      payload?.triggerGesture?.metaKey === true ||
      payload?.triggerGesture?.ctrlKey === true;

    if (!nodeId) {
      clearSelection();
      return;
    }

    const node = resolveNode(nodeId);

    if (node) {
      syncLayoutSlotOnNodeSelect({
        nodeId,
        registry: editorNodeRegistry ?? null,
        activeLayoutSlot: activeLayoutSlot ?? null,
        layout: currentLayout.value,
      });
      expandAncestors(nodeId);
      if (isAdditiveSelection) {
        toggleSelection(nodeId);
      } else {
        focusNode(nodeId);
      }

      nextTick(() => {
        const element = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }
  });
}
