import type { BuilderNode } from "../../../../lib/types/nodes";

function findNodeInTree(
  nodes: readonly BuilderNode[],
  targetId: string,
): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }

    if (node.children.length === 0) {
      continue;
    }

    const nested = findNodeInTree(node.children, targetId);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function isDescendantOfNode(node: BuilderNode, targetId: string): boolean {
  if (node.id === targetId) {
    return true;
  }

  for (const child of node.children) {
    if (isDescendantOfNode(child, targetId)) {
      return true;
    }
  }

  return false;
}

function findDirectChildList(node: BuilderNode): BuilderNode | null {
  return (
    node.children.find((child) => child.type?.toLowerCase() === "list") ?? null
  );
}

export function findNearestListContextNode(
  nodes: readonly BuilderNode[],
  targetId: string,
  currentListNode: BuilderNode | null = null,
): BuilderNode | null {
  for (const node of nodes) {
    const nextListNode =
      node.type?.toLowerCase() === "list" ? node : currentListNode;

    if (node.id === targetId) {
      return nextListNode;
    }

    if (node.children.length === 0) {
      continue;
    }

    const nested = findNearestListContextNode(
      node.children,
      targetId,
      nextListNode,
    );
    if (nested) {
      return nested;
    }
  }

  return null;
}

export function findNearestListItemContextNode(
  nodes: readonly BuilderNode[],
  targetId: string,
  currentListItemNode: BuilderNode | null = null,
): BuilderNode | null {
  for (const node of nodes) {
    const nextListItemNode =
      node.type?.toLowerCase() === "listitem" ? node : currentListItemNode;

    if (node.id === targetId) {
      return nextListItemNode;
    }

    if (node.children.length === 0) {
      continue;
    }

    const nested = findNearestListItemContextNode(
      node.children,
      targetId,
      nextListItemNode,
    );
    if (nested) {
      return nested;
    }
  }

  return null;
}

/**
 * Resolves which list node the inspector List controls should edit. When
 * a listitem contains a nested list, selections on that listitem or.
 */
export function findEditableListContextNode(
  nodes: readonly BuilderNode[],
  targetId: string,
): BuilderNode | null {
  const targetNode = findNodeInTree(nodes, targetId);
  if (!targetNode) {
    return null;
  }

  if (targetNode.type?.toLowerCase() === "list") {
    return targetNode;
  }

  const listItemContext = findNearestListItemContextNode(nodes, targetId);
  if (listItemContext) {
    const nestedList = findDirectChildList(listItemContext);
    if (
      nestedList &&
      (targetId === listItemContext.id ||
        isDescendantOfNode(nestedList, targetId))
    ) {
      return nestedList;
    }
  }

  return findNearestListContextNode(nodes, targetId);
}
