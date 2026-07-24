/**
 * Tree traversal, search, and manipulation helpers. All
 * functions are pure (no side effects).
 */

import {
  isStructuralContainerNodeType,
  normalizeContainerNodeType,
} from "../../../../lib/blocks/containerTypes";
import {
  getCanonicalIconIdFromValue,
  parseCanonicalIconId,
} from "../../../../lib/icons/reference";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { cloneDeep } from "../../Core";
import type { TypeCount } from "../types";

/**
 * Recursively traverses a node tree and executes a callback for each node.
 *
 * @param nodes - Node array to traverse
 * @param callback - Function to execute for each node
 * @param path - Current path (array of ancestor IDs)
 */
export function traverseNodes(
  nodes: ReadonlyArray<BuilderNode>,
  callback: (node: BuilderNode, path: readonly string[], depth: number) => void,
  path: readonly string[] = [],
): void {
  for (const node of nodes) {
    const currentPath = [...path, node.id];
    callback(node, currentPath, path.length);

    if (node.children && node.children.length > 0) {
      traverseNodes(node.children, callback, currentPath);
    }
  }
}

/**
 * Find a node by ID in a tree.
 *
 * @param nodes - Node array to search
 * @param targetId - Node ID to find
 * @returns The found node or null
 */
export function findNodeById(
  nodes: ReadonlyArray<BuilderNode>,
  targetId: string,
): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }

    if (node.children && node.children.length > 0) {
      const found = findNodeById(node.children, targetId);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Find the parent node of a given node ID.
 *
 * @param nodes - Node array to search
 * @param targetId - Node ID to find parent of
 * @param parent - Current parent (used internally for recursion)
 * @returns The parent node or null if not found or root
 */
export function findParentNode(
  nodes: ReadonlyArray<BuilderNode>,
  targetId: string,
  parent: BuilderNode | null = null,
): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return parent;
    }

    if (node.children && node.children.length > 0) {
      const found = findParentNode(node.children, targetId, node);
      if (found !== null) return found;
    }
  }

  return null;
}

/**
 * Get the path to a node (array of ancestor IDs).
 *
 * @param nodes - Node array to search
 * @param targetId - Node ID to find path to
 * @param currentPath - Current path (used internally for recursion)
 * @returns Array of ancestor IDs, or empty array if not found
 */
export function getNodePath(
  nodes: ReadonlyArray<BuilderNode>,
  targetId: string,
  currentPath: readonly string[] = [],
): readonly string[] {
  for (const node of nodes) {
    const newPath = [...currentPath, node.id];

    if (node.id === targetId) {
      return newPath;
    }

    if (node.children && node.children.length > 0) {
      const found = getNodePath(node.children, targetId, newPath);
      if (found.length > 0) return found;
    }
  }

  return [];
}

/**
 * Get depth of a node in the tree.
 *
 * @param nodes - Node array to search
 * @param targetId - Node ID to get depth of
 * @returns Depth (0 = root) or -1 if not found
 */
export function getNodeDepth(
  nodes: ReadonlyArray<BuilderNode>,
  targetId: string,
): number {
  const path = getNodePath(nodes, targetId);
  return path.length > 0 ? path.length - 1 : -1;
}

/**
 * Check if a node is an ancestor of another node.
 *
 * @param nodes - Node array to search
 * @param ancestorId - Potential ancestor node ID
 * @param descendantId - Potential descendant node ID
 * @returns True if ancestorId is an ancestor of descendantId
 */
export function isAncestor(
  nodes: ReadonlyArray<BuilderNode>,
  ancestorId: string,
  descendantId: string,
): boolean {
  if (ancestorId === descendantId) {
    return false;
  }
  const path = getNodePath(nodes, descendantId);
  return path.includes(ancestorId);
}

/**
 * Check if a node is a descendant of another node.
 *
 * @param nodes - Node array to search
 * @param descendantId - Potential descendant node ID
 * @param ancestorId - Potential ancestor node ID
 * @returns True if descendantId is a descendant of ancestorId
 */
export function isDescendant(
  nodes: ReadonlyArray<BuilderNode>,
  descendantId: string,
  ancestorId: string,
): boolean {
  return isAncestor(nodes, ancestorId, descendantId);
}

/**
 * Get all descendant node IDs for a given node.
 *
 * @param node - Node to get descendants of
 * @returns Set of descendant node IDs
 */
export function getDescendantIds(node: BuilderNode): ReadonlySet<string> {
  const descendants = new Set<string>();

  function traverse(n: BuilderNode): void {
    descendants.add(n.id);
    n.children?.forEach(traverse);
  }

  if (node.children) {
    node.children.forEach(traverse);
  }

  return descendants;
}

/**
 * Collect all node IDs in a tree.
 *
 * @param nodes - Node array to collect IDs from
 * @returns Set of all node IDs
 */
export function collectAllNodeIds(
  nodes: ReadonlyArray<BuilderNode>,
): ReadonlySet<string> {
  const allIds = new Set<string>();

  traverseNodes(nodes, (node) => {
    allIds.add(node.id);
  });

  return allIds;
}

const LEAF_NODE_TYPE_KEYS = new Set([
  "image",
  "icon",
  "text",
  "input",
  "video",
  "hr",
  "br",
  "link",
]);

/**
 * Container node types that can have children
 */
const CONTAINER_NODE_TYPE_KEYS = new Set([
  "container",
  "section",
  "layout",
  "component",
  "box",
  "flex",
  "grid",
  "stack",
  "list",
  "listitem",
]);

function getNodeTypeKey(nodeType: string): string {
  return normalizeContainerNodeType(nodeType).toLowerCase();
}

/**
 * Check if a node type is a leaf (cannot have children).
 *
 * @param nodeType - Node type to check
 * @returns True if node is a leaf type
 */
export function isLeafNodeType(nodeType: string): boolean {
  return LEAF_NODE_TYPE_KEYS.has(getNodeTypeKey(nodeType));
}

/**
 * Check if a node type is a container (can have children).
 *
 * @param nodeType - Node type to check
 * @returns True if node is a container type
 */
export function isContainerNodeType(nodeType: string): boolean {
  return (
    CONTAINER_NODE_TYPE_KEYS.has(getNodeTypeKey(nodeType)) ||
    isStructuralContainerNodeType(nodeType)
  );
}

/**
 * Check if a node can have children.
 *
 * @param node - Node to check
 * @returns True if node can have children
 */
export function canHaveChildren(node: BuilderNode): boolean {
  return (
    isContainerNodeType(node.type) ||
    (node.children !== undefined && node.children.length > 0)
  );
}

/**
 * Check if a node has children.
 *
 * @param node - Node to check
 * @returns True if node has children
 */
export function hasChildren(node: BuilderNode): boolean {
  return node.children !== undefined && node.children.length > 0;
}

/**
 * Check if a node is a component instance.
 *
 * @param node - Node to check
 * @returns True if node is a component instance
 */
export function isComponentInstance(node: BuilderNode): boolean {
  return node.type === "Component" && !!node.componentRef;
}

/**
 * Get a display label for a node.
 *
 * @param node - Node to get label for
 * @returns Display label
 */
export function getNodeLabel(node: BuilderNode): string {
  const normalizedType = getNodeTypeKey(node.type);

  // Prefer metadata.label if available
  if (node.metadata?.label) {
    return node.metadata.label;
  }

  // For components, show component name
  if (isComponentInstance(node) && node.componentRef) {
    return `<${node.componentRef}>`;
  }

  if (normalizedType === "code") {
    return "Code";
  }

  if (normalizedType === "svg") {
    return "SVG";
  }

  if (normalizedType === "list") {
    return "List";
  }

  if (normalizedType === "listitem") {
    return "List item";
  }

  if (normalizedType === "icon") {
    const canonicalId = getCanonicalIconIdFromValue(node.props?.icon);
    const parsed = canonicalId ? parseCanonicalIconId(canonicalId) : null;
    if (parsed?.name) {
      return parsed.name
        .split("-")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
    }
  }

  // For text nodes, show truncated content
  if (
    (normalizedType === "text" || normalizedType === "paragraph") &&
    (typeof node.props?.text === "string" ||
      typeof node.props?.content === "string")
  ) {
    const text = String(node.props.text ?? node.props.content);
    return text.length > 30 ? `${text.slice(0, 30)}...` : text;
  }

  // Default: show type
  return node.type;
}

/**
 * Count total number of nodes in a tree.
 *
 * @param nodes - Node array to count
 * @returns Total node count
 */
export function countNodes(nodes: ReadonlyArray<BuilderNode>): number {
  let count = 0;
  traverseNodes(nodes, () => count++);
  return count;
}

/**
 * Count nodes by type.
 *
 * @param nodes - Node array to analyze
 * @returns Array of type counts sorted by count (descending)
 */
export function countNodesByType(
  nodes: ReadonlyArray<BuilderNode>,
): readonly TypeCount[] {
  const counts = new Map<string, number>();

  traverseNodes(nodes, (node) => {
    counts.set(node.type, (counts.get(node.type) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get maximum depth of a tree.
 *
 * @param nodes - Node array to analyze
 * @returns Maximum depth (0 = root level)
 */
export function getMaxDepth(nodes: ReadonlyArray<BuilderNode>): number {
  let maxDepth = 0;

  traverseNodes(nodes, (_, __, depth) => {
    if (depth > maxDepth) {
      maxDepth = depth;
    }
  });

  return maxDepth;
}

// TREE MANIPULATION (Pure - Returns New Tree)

/**
 * Clone a node tree deeply.
 *
 * @param nodes - Node array to clone
 * @returns Cloned node array
 */
export function cloneNodeTree(
  nodes: ReadonlyArray<BuilderNode>,
): BuilderNode[] {
  return cloneDeep([...nodes]);
}

/**
 * Remove a node from a tree by ID.
 *
 * @param nodes - Node array to remove from
 * @param targetId - Node ID to remove
 * @returns New tree with node removed
 */
export function removeNodeById(
  nodes: ReadonlyArray<BuilderNode>,
  targetId: string,
): BuilderNode[] {
  return nodes
    .filter((node) => node.id !== targetId)
    .map((node) => {
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: removeNodeById(node.children, targetId),
        };
      }
      return node;
    });
}

/**
 * Update a node in a tree by ID.
 *
 * @param nodes - Node array to update
 * @param targetId - Node ID to update
 * @param updater - Function that returns updated node
 * @returns New tree with node updated
 */
export function updateNodeById(
  nodes: ReadonlyArray<BuilderNode>,
  targetId: string,
  updater: (node: BuilderNode) => BuilderNode,
): BuilderNode[] {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return updater(node);
    }

    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: updateNodeById(node.children, targetId, updater),
      };
    }

    return node;
  });
}

/**
 * Check for duplicate IDs in a tree.
 *
 * @param nodes - Node array to check
 * @returns Array of duplicate IDs
 */
export function findDuplicateIds(
  nodes: ReadonlyArray<BuilderNode>,
): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  traverseNodes(nodes, (node) => {
    if (seen.has(node.id)) {
      duplicates.add(node.id);
    }
    seen.add(node.id);
  });

  return Array.from(duplicates);
}

/**
 * Validate that all node IDs are non-empty strings.
 *
 * @param nodes - Node array to validate
 * @returns True if all IDs are valid
 */
export function validateNodeIds(nodes: ReadonlyArray<BuilderNode>): boolean {
  let allValid = true;

  traverseNodes(nodes, (node) => {
    if (
      !node.id ||
      typeof node.id !== "string" ||
      node.id.trim().length === 0
    ) {
      allValid = false;
    }
  });

  return allValid;
}
