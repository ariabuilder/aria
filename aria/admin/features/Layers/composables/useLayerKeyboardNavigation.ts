import type { Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type { CollapseState } from "../types";

interface LayerKeyboardLayoutInfo {
  slots?: Array<{
    name: string;
  }>;
}

interface VisibleNodeEntry {
  node: BuilderNode;
  parentId: string | null;
}

export interface UseLayerKeyboardNavigationOptions {
  currentPageNodes: Ref<BuilderNode[]>;
  currentLayout: Ref<LayerKeyboardLayoutInfo | undefined>;
  currentItemType: Ref<"page" | "layout" | "component" | undefined>;
  currentVirtualSlot: Ref<string>;
  focusedNodeId: Ref<string | null>;
  editingNodeId: Ref<string | null>;
  expandedNodes: Ref<Set<string>>;
  collapseState: Ref<Map<string, CollapseState>>;
  getNodesInSlot: (slotName: string) => BuilderNode[];
  hasChildren: (node: BuilderNode) => boolean;
  findNodeById: (nodes: BuilderNode[], targetId: string) => BuilderNode | null;
  selectNode: (node: BuilderNode) => void;
  setEditingNodeId: (id: string | null) => void;
  deleteNodeById: (nodeId: string) => void;
  selectedNodeIds?: Ref<string[]>;
  deleteNodesById?: (nodeIds: string[]) => void;
}

export function useLayerKeyboardNavigation(
  options: UseLayerKeyboardNavigationOptions,
) {
  const {
    currentPageNodes,
    currentLayout,
    currentItemType,
    currentVirtualSlot,
    focusedNodeId,
    editingNodeId,
    expandedNodes,
    collapseState,
    getNodesInSlot,
    hasChildren,
    findNodeById,
    selectNode,
    setEditingNodeId,
    deleteNodeById,
    deleteNodesById,
    selectedNodeIds,
  } = options;

  const isNodeExpanded = (nodeId: string): boolean => {
    return expandedNodes.value.has(nodeId);
  };

  const canShowChildren = (node: BuilderNode): boolean => {
    const state = collapseState.value.get(node.id) ?? "expanded";
    const isCollapsed =
      state === "soft-collapsed" || state === "full-collapsed";
    const isComponentInstance =
      node.type === "Component" || !!node.componentRef;
    return !isCollapsed && !isComponentInstance && isNodeExpanded(node.id);
  };

  const collectVisibleNodes = (): VisibleNodeEntry[] => {
    const entries: VisibleNodeEntry[] = [];

    const walkNodes = (nodes: BuilderNode[], parentId: string | null): void => {
      for (const node of nodes) {
        entries.push({ node, parentId });
        if (
          hasChildren(node) &&
          canShowChildren(node) &&
          node.children?.length
        ) {
          walkNodes(node.children, node.id);
        }
      }
    };

    if (
      currentItemType.value === "page" &&
      currentLayout.value?.slots &&
      currentLayout.value.slots.length > 0
    ) {
      for (const slot of currentLayout.value.slots) {
        walkNodes(getNodesInSlot(slot.name), null);
      }
    } else {
      walkNodes(getNodesInSlot(currentVirtualSlot.value), null);
    }

    return entries;
  };

  const expandNode = (nodeId: string): void => {
    expandedNodes.value.add(nodeId);
    expandedNodes.value = new Set(expandedNodes.value);
    collapseState.value.set(nodeId, "expanded");
  };

  const collapseNode = (nodeId: string): void => {
    expandedNodes.value.delete(nodeId);
    expandedNodes.value = new Set(expandedNodes.value);
    collapseState.value.set(nodeId, "soft-collapsed");
  };

  const handleTreeKeydown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }

    const selectedId = focusedNodeId.value;
    if (!selectedId) return;

    const visibleNodes = collectVisibleNodes();
    if (visibleNodes.length === 0) return;

    const currentIndex = visibleNodes.findIndex(
      (entry) => entry.node.id === selectedId,
    );
    if (currentIndex === -1) return;

    const selectedEntry = visibleNodes[currentIndex];
    const selectedNode =
      findNodeById(currentPageNodes.value, selectedEntry.node.id) ||
      selectedEntry.node;

    switch (event.key) {
      case "ArrowDown": {
        if (currentIndex < visibleNodes.length - 1) {
          selectNode(visibleNodes[currentIndex + 1].node);
          event.preventDefault();
        }
        break;
      }
      case "ArrowUp": {
        if (currentIndex > 0) {
          selectNode(visibleNodes[currentIndex - 1].node);
          event.preventDefault();
        }
        break;
      }
      case "ArrowRight": {
        if (hasChildren(selectedNode)) {
          if (!isNodeExpanded(selectedNode.id)) {
            expandNode(selectedNode.id);
          } else if (selectedNode.children?.length) {
            selectNode(selectedNode.children[0]);
          }
          event.preventDefault();
        }
        break;
      }
      case "ArrowLeft": {
        if (hasChildren(selectedNode) && isNodeExpanded(selectedNode.id)) {
          collapseNode(selectedNode.id);
          event.preventDefault();
          break;
        }

        if (selectedEntry.parentId) {
          const parentNode = findNodeById(
            currentPageNodes.value,
            selectedEntry.parentId,
          );
          if (parentNode) {
            selectNode(parentNode);
            event.preventDefault();
          }
        }
        break;
      }
      case "Enter": {
        if (!editingNodeId.value) {
          setEditingNodeId(selectedNode.id);
          event.preventDefault();
        }
        break;
      }
      case "Delete":
      case "Backspace": {
        if (!editingNodeId.value) {
          if (
            deleteNodesById &&
            selectedNodeIds?.value &&
            selectedNodeIds.value.length > 1
          ) {
            deleteNodesById(selectedNodeIds.value);
          } else {
            deleteNodeById(selectedNode.id);
          }
          event.preventDefault();
        }
        break;
      }
      default:
        break;
    }
  };

  return {
    handleTreeKeydown,
  };
}
