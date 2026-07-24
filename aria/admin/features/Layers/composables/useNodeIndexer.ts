/**
 * Layers Feature - Node Indexer
 *
 * Creates fast lookup indexes for node tree navigation.
 */

import { shallowRef, readonly, computed } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type { TypeCount } from "../types";
import { traverseNodes } from "../utils/nodeHelpers";
import { log } from "@/lib/utils/logger";

interface IndexEntry {
  node: BuilderNode;
  path: readonly string[];
  depth: number;
  /** Parent node ID (null for root) */
  parentId: string | null;
}

/**
 * Node indexer for fast lookups and tree navigation.
 *
 * Builds and maintains indexes for efficient node access.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * const indexer = useNodeIndexer({ debug: true });
 *
 * // Build index from tree
 * indexer.buildIndex(nodes);
 *
 * // Fast lookup
 * const node = indexer.getNode('node-123');
 * const parent = indexer.getParent('node-123');
 * const children = indexer.getChildren('node-123');
 * ```
 */
export function useNodeIndexer(options: { debug?: boolean } = {}) {
  const { debug = false } = options;

  /**
   * Node lookup map (ID → IndexEntry)
   */
  const nodeIndex = shallowRef<Map<string, IndexEntry>>(new Map());

  /**
   * Children lookup map (Parent ID → Child IDs[])
   */
  const childrenIndex = shallowRef<Map<string, string[]>>(new Map());

  /**
   * Type index map (Type → Node IDs[])
   */
  const typeIndex = shallowRef<Map<string, string[]>>(new Map());

  /**
   * Total number of indexed nodes
   */
  const indexSize = computed<number>(() => nodeIndex.value.size);

  /**
   * Whether index is built
   */
  const isIndexed = computed<boolean>(() => indexSize.value > 0);

  /**
   * All indexed node IDs
   */
  const allNodeIds = computed<readonly string[]>(() =>
    Array.from(nodeIndex.value.keys()),
  );

  /**
   * Node type counts
   */
  const typeCounts = computed<readonly TypeCount[]>(() => {
    const counts: TypeCount[] = [];

    for (const [type, nodeIds] of typeIndex.value.entries()) {
      counts.push({ type, count: nodeIds.length });
    }

    return counts.sort((a, b) => b.count - a.count);
  });

  /**
   * Build index from node tree.
   *
   * @param nodes - Node tree to index
   */
  function buildIndex(nodes: readonly BuilderNode[]): void {
    nodeIndex.value.clear();
    childrenIndex.value.clear();
    typeIndex.value.clear();

    traverseNodes(nodes, (node, path, depth) => {
      const parentId = path.length > 1 ? path[path.length - 2] : null;

      // Add to node index
      nodeIndex.value.set(node.id, {
        node,
        path,
        depth,
        parentId,
      });

      // Add to children index
      if (parentId) {
        const siblings = childrenIndex.value.get(parentId) || [];
        siblings.push(node.id);
        childrenIndex.value.set(parentId, siblings);
      }

      // Add to type index
      const typeNodes = typeIndex.value.get(node.type) || [];
      typeNodes.push(node.id);
      typeIndex.value.set(node.type, typeNodes);
    });

    if (debug) {
      log("debug", "[useNodeIndexer] Built index", {
        indexSize: indexSize.value,
      });
    }
  }

  /**
   * Clear all indexes.
   */
  function clearIndex(): void {
    nodeIndex.value.clear();
    childrenIndex.value.clear();
    typeIndex.value.clear();

    if (debug) {
      log("debug", "[useNodeIndexer] Cleared index");
    }
  }

  /**
   * Update index for a single node (after modification).
   *
   * @param nodeId - Node ID to update
   * @param node - Updated node
   * @param nodes - Full node tree (for path calculation)
   */
  function updateNode(
    nodeId: string,
    node: BuilderNode,
    _nodes: readonly BuilderNode[],
  ): void {
    const entry = nodeIndex.value.get(nodeId);

    if (!entry) {
      if (debug) {
        log("warn", "[useNodeIndexer] Cannot update non-indexed node", {
          nodeId,
        });
      }
      return;
    }

    entry.node = node;
    nodeIndex.value.set(nodeId, entry);

    // Update type index if type changed
    const oldType = typeIndex.value.get(node.type);
    if (oldType) {
      typeIndex.value.set(
        node.type,
        oldType.filter((id) => id !== nodeId).concat(nodeId),
      );
    }

    if (debug) {
      log("debug", "[useNodeIndexer] Updated node", { nodeId });
    }
  }

  /**
   * Get node by ID.
   *
   * @param nodeId - Node ID to find
   * @returns Node or null if not found
   */
  function getNode(nodeId: string): BuilderNode | null {
    return nodeIndex.value.get(nodeId)?.node || null;
  }

  /**
   * Get parent node ID.
   *
   * @param nodeId - Node ID to get parent of
   * @returns Parent ID or null if root node or not found
   */
  function getParentId(nodeId: string): string | null {
    return nodeIndex.value.get(nodeId)?.parentId || null;
  }

  /**
   * Get parent node.
   *
   * @param nodeId - Node ID to get parent of
   * @returns Parent node or null
   */
  function getParent(nodeId: string): BuilderNode | null {
    const parentId = getParentId(nodeId);
    return parentId ? getNode(parentId) : null;
  }

  /**
   * Get child node IDs.
   *
   * @param nodeId - Node ID to get children of
   * @returns Array of child IDs
   */
  function getChildrenIds(nodeId: string): readonly string[] {
    return childrenIndex.value.get(nodeId) || [];
  }

  /**
   * Get child nodes.
   *
   * @param nodeId - Node ID to get children of
   * @returns Array of child nodes
   */
  function getChildren(nodeId: string): readonly BuilderNode[] {
    const childIds = getChildrenIds(nodeId);
    return childIds
      .map((id) => getNode(id))
      .filter((node): node is BuilderNode => node !== null);
  }

  /**
   * Get node path (ancestor IDs).
   *
   * @param nodeId - Node ID to get path of
   * @returns Array of ancestor IDs
   */
  function getPath(nodeId: string): readonly string[] {
    return nodeIndex.value.get(nodeId)?.path || [];
  }

  /**
   * Get node depth.
   *
   * @param nodeId - Node ID to get depth of
   * @returns Depth (0 = root) or -1 if not found
   */
  function getDepth(nodeId: string): number {
    return nodeIndex.value.get(nodeId)?.depth ?? -1;
  }

  /**
   * Get all nodes of a specific type.
   *
   * @param type - Node type to find
   * @returns Array of nodes of that type
   */
  function getNodesByType(type: string): readonly BuilderNode[] {
    const nodeIds = typeIndex.value.get(type) || [];
    return nodeIds
      .map((id) => getNode(id))
      .filter((node): node is BuilderNode => node !== null);
  }

  /**
   * Check if a node exists in the index.
   *
   * @param nodeId - Node ID to check
   * @returns True if node is indexed
   */
  function hasNode(nodeId: string): boolean {
    return nodeIndex.value.has(nodeId);
  }

  return {
    // State (readonly)
    indexSize,
    isIndexed,
    allNodeIds,
    typeCounts,

    buildIndex: readonly(buildIndex),
    clearIndex: readonly(clearIndex),
    updateNode: readonly(updateNode),

    getNode: readonly(getNode),
    getParent: readonly(getParent),
    getParentId: readonly(getParentId),
    getChildren: readonly(getChildren),
    getChildrenIds: readonly(getChildrenIds),
    getPath: readonly(getPath),
    getDepth: readonly(getDepth),
    getNodesByType: readonly(getNodesByType),
    hasNode: readonly(hasNode),
  };
}
