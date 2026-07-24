/**
 * UseNodeManipulation. ts Handles all node tree
 * operations: find, delete, duplicate, reorder, etc.
 */

import { type Ref, toRaw } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { BuilderNodeSchema } from "../../../../lib/schemas/nodes";
import { regenerateNodeTreeIds } from "../../../../lib/ids/nodeId";
import type { NodeFindResult } from "../../../types/app";

export function useNodeManipulation(pageBlocks: Ref<BuilderNode[]>) {
  const nodePathCache = new Map<string, string[]>();

  /**
   * Find a node by ID in a tree
   */
  const findNodeById = (
    nodes: BuilderNode[],
    id: string,
  ): BuilderNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children?.length) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  /**
   * Find the path (root → leaf) to a node by ID
   */
  const findNodePath = (
    nodes: BuilderNode[],
    targetId: string,
    path: string[] = [],
  ): string[] | null => {
    for (const node of nodes) {
      const newPath = [...path, node.id];
      if (node.id === targetId) return newPath;
      if (node.children?.length) {
        const found = findNodePath(node.children, targetId, newPath);
        if (found) return found;
      }
    }
    return null;
  };

  /**
   * Find node and its parent for operations like delete/reorder
   */
  const findNodeToDelete = (
    nodes: BuilderNode[],
    id: string,
    parent: BuilderNode | null = null,
  ): NodeFindResult | null => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return { node: nodes[i], parent, index: i };
      if (nodes[i].children?.length) {
        const found = findNodeToDelete(nodes[i].children, id, nodes[i]);
        if (found) return found;
      }
    }
    return null;
  };

  /**
   * Compatibility shim for prior memoized node cache.
   *
   * Node object caching was removed to avoid storing mutable tree-derived
   * node state outside the canonical tree.
   */
  const clearNodeCache = (): void => {
    return;
  };

  /**
   * Build path cache for all nodes (optimization for tree navigation)
   */
  const buildNodePathCache = (
    nodes: BuilderNode[],
    parentPath: string[] = [],
  ): void => {
    nodePathCache.clear();
    const buildRecursive = (
      nodeList: BuilderNode[],
      parentIds: string[] = [],
    ) => {
      for (const node of nodeList) {
        const currentPath = [...parentIds, node.id];
        nodePathCache.set(node.id, currentPath);
        if (node.children?.length) {
          buildRecursive(node.children, currentPath);
        }
      }
    };
    buildRecursive(nodes, parentPath);
  };

  /**
   * Get cached path for a node ID
   */
  const getNodePath = (id: string): string[] => nodePathCache.get(id) || [];

  /**
   * Clone a node with new IDs for all descendants
   */
  const regenerateNodeIds = (node: BuilderNode): BuilderNode => {
    // Use toRaw to unwrap Vue proxies before cloning
    // Fallback to JSON parse/stringify if structuredClone fails (e.g. with proxies or non-cloneables)
    let clonedValue: unknown;
    try {
      clonedValue = structuredClone(toRaw(node));
    } catch (e) {
      console.warn("structuredClone failed, falling back to JSON clone", e);
      clonedValue = JSON.parse(JSON.stringify(toRaw(node))) as unknown;
    }

    const parsedCloned = BuilderNodeSchema.safeParse(clonedValue);
    if (!parsedCloned.success) {
      throw new Error("Failed to clone node: invalid cloned node structure");
    }

    return regenerateNodeTreeIds(parsedCloned.data);
  };

  /**
   * Get all descendants of a node
   */
  const getNodeDescendants = (node: BuilderNode): BuilderNode[] => {
    const descendants: BuilderNode[] = [];
    const collect = (n: BuilderNode): void => {
      n.children?.forEach((child) => {
        descendants.push(child);
        collect(child);
      });
    };
    collect(node);
    return descendants;
  };

  /**
   * Get all ancestors of a node
   */
  const getNodeAncestors = (
    nodes: BuilderNode[],
    nodeId: string,
  ): BuilderNode[] => {
    const path = findNodePath(nodes, nodeId);
    if (!path?.length) return [];

    const ancestors: BuilderNode[] = [];
    for (const id of path.slice(0, -1)) {
      const ancestor = findNodeById(nodes, id);
      if (ancestor) ancestors.push(ancestor);
    }
    return ancestors;
  };

  /**
   * Get the parent array of a node
   */
  const getNodeParentArray = (
    nodes: BuilderNode[],
    nodeId: string,
  ): BuilderNode[] | null => {
    const result = findNodeToDelete(nodes, nodeId);
    if (!result) return null;
    return result.parent ? result.parent.children || [] : nodes;
  };

  /**
   * Count total nodes in tree
   */
  const countNodes = (nodes: BuilderNode[] = pageBlocks.value): number => {
    let count = 0;
    const tally = (nodeList: BuilderNode[]): void => {
      count += nodeList.length;
      nodeList.forEach((n) => n.children?.length && tally(n.children));
    };
    tally(nodes);
    return count;
  };

  /**
   * Get tree depth
   */
  const getTreeDepth = (nodes: BuilderNode[] = pageBlocks.value): number => {
    let maxDepth = 0;
    const measure = (nodeList: BuilderNode[], depth: number): void => {
      maxDepth = Math.max(maxDepth, depth);
      nodeList.forEach(
        (n) => n.children?.length && measure(n.children, depth + 1),
      );
    };
    measure(nodes, 1);
    return maxDepth;
  };

  /**
   * Validate node structure integrity
   */
  const validateNodeStructure = (nodes: BuilderNode[]): boolean => {
    const validateRecursive = (nodeList: BuilderNode[]): boolean => {
      for (const node of nodeList) {
        if (!node.id || !node.type) return false;
        if (node.children?.length && !validateRecursive(node.children))
          return false;
      }
      return true;
    };

    try {
      return validateRecursive(nodes);
    } catch {
      return false;
    }
  };

  /**
   * Find all nodes matching a predicate
   */
  const findNodesByPredicate = (
    nodes: BuilderNode[],
    predicate: (node: BuilderNode) => boolean,
  ): BuilderNode[] => {
    const matches: BuilderNode[] = [];
    const walk = (nodeList: BuilderNode[]): void => {
      nodeList.forEach((node) => {
        if (predicate(node)) matches.push(node);
        if (node.children?.length) walk(node.children);
      });
    };
    walk(nodes);
    return matches;
  };

  /**
   * Find nodes by type
   */
  const findNodesByType = (nodes: BuilderNode[], type: string): BuilderNode[] =>
    findNodesByPredicate(nodes, (node) => node.type === type);

  /**
   * Get siblings of a node
   */
  const getNodeSiblings = (
    nodes: BuilderNode[],
    nodeId: string,
  ): BuilderNode[] => {
    const result = findNodeToDelete(nodes, nodeId);
    if (!result?.parent) return nodes.filter((n) => n.id !== nodeId);
    return (result.parent.children || []).filter((n) => n.id !== nodeId);
  };

  /**
   * Get next sibling
   */
  const getNextSibling = (
    nodes: BuilderNode[],
    nodeId: string,
  ): BuilderNode | null => {
    const result = findNodeToDelete(nodes, nodeId);
    if (!result) return null;
    const parentArray = result.parent ? result.parent.children : nodes;
    return parentArray?.[result.index + 1] || null;
  };

  /**
   * Get previous sibling
   */
  const getPreviousSibling = (
    nodes: BuilderNode[],
    nodeId: string,
  ): BuilderNode | null => {
    const result = findNodeToDelete(nodes, nodeId);
    if (!result) return null;
    const parentArray = result.parent ? result.parent.children : nodes;
    return parentArray?.[result.index - 1] || null;
  };

  return {
    findNodeById,
    findNodePath,
    findNodeToDelete,

    clearNodeCache,
    buildNodePathCache,
    getNodePath,

    regenerateNodeIds,
    getNodeDescendants,
    getNodeAncestors,
    getNodeParentArray,
    getNodeSiblings,
    getNextSibling,
    getPreviousSibling,

    countNodes,
    getTreeDepth,
    validateNodeStructure,
    findNodesByPredicate,
    findNodesByType,
  };
}
