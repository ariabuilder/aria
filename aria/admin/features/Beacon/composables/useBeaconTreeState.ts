import { ref } from "vue";

import type { BuilderNode } from "../../../../lib/types/nodes";
import { useSelectionTreeState } from "../../Core/composables/useSelectionTreeState";

const focusedPath = ref<string[]>([]);
const { selectionTreeRootNodes: rootNodes } = useSelectionTreeState();

function findNodeInTree(
  nodes: readonly BuilderNode[] | BuilderNode[],
  id: string,
): BuilderNode | null {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;

  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findNodeInTree(node.children, id);
      if (found) return found;
    }
  }

  return null;
}

function findNodeWithPath(
  nodes: readonly BuilderNode[] | BuilderNode[],
  id: string,
  currentPath: string[] = [],
): { node: BuilderNode; path: string[] } | null {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;

  for (const node of nodes) {
    if (node.id === id) {
      return { node, path: currentPath };
    }

    if (node.children?.length) {
      const result = findNodeWithPath(node.children, id, [...currentPath, node.id]);
      if (result) return result;
    }
  }

  return null;
}

function updateNodeClassNamesInTree(
  nodes: BuilderNode[],
  nodeId: string,
  classNames: Record<string, string[]>,
): boolean {
  for (const node of nodes) {
    if (node.id === nodeId) {
      node.classNames = classNames;
      return true;
    }
    if (node.children?.length) {
      if (updateNodeClassNamesInTree(node.children, nodeId, classNames)) {
        return true;
      }
    }
  }

  return false;
}

function updateNodePropsInTree(
  nodes: BuilderNode[],
  nodeId: string,
  props: BuilderNode["props"],
): boolean {
  for (const node of nodes) {
    if (node.id === nodeId) {
      node.props = {
        ...(node.props ?? {}),
        ...props,
      };
      return true;
    }
    if (node.children?.length) {
      if (updateNodePropsInTree(node.children, nodeId, props)) {
        return true;
      }
    }
  }

  return false;
}

function setFocusedPath(path: string[] = []): void {
  focusedPath.value = [...path];
}

function clearFocusedPath(): void {
  focusedPath.value = [];
}

function setRootNodes(nodes: BuilderNode[], selectedNodeId?: string | null): void {
  const { setSelectionTreeRootNodes } = useSelectionTreeState();
  setSelectionTreeRootNodes(nodes);

  if (!selectedNodeId) {
    return;
  }

  const result = findNodeWithPath(nodes, selectedNodeId);
  if (result) {
    setFocusedPath(result.path);
  }
}

export function useBeaconTreeState() {
  return {
    focusedPath,
    rootNodes,
    findNodeInTree,
    findNodeWithPath,
    updateNodeClassNamesInTree,
    updateNodePropsInTree,
    setFocusedPath,
    clearFocusedPath,
    setRootNodes,
  };
}
