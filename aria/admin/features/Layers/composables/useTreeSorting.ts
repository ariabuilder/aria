/**
 * Node reordering logic for drag-drop operations. Part
 * of the micro-composable split from useNodeDragDrop.
 */

import type { BuilderNode } from "../../../../lib/types/nodes";
import type { DragOperation, DropPosition } from "../types";
import { findNodeById, findParentNode } from "../utils/nodeHelpers";
import { log } from "@/lib/utils/logger";

interface ReorderResult {
  success: boolean;
  newTree: readonly BuilderNode[];
  error?: string;
}

/**
 * Tree sorting and reordering for drag-drop operations.
 *
 * Calculates insertion indices and executes node moves.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * const sorting = useTreeSorting({ debug: true });
 *
 * // Execute a reorder operation
 * const result = sorting.reorderNodes({
 *   nodes: currentBlocks,
 *   draggedNodeId: 'node-1',
 *   targetNodeId: 'node-2',
 *   position: 'after'
 * });
 *
 * if (result.success) {
 *   pageBlocks.value = result.newTree;
 * }
 * ```
 */
export function useTreeSorting(options: { debug?: boolean } = {}) {
  const { debug = false } = options;

  /**
   * Calculate the insertion index for a drop operation.
   *
   * @param siblings - Array of sibling nodes
   * @param targetNodeId - ID of target node
   * @param position - Drop position ('before' or 'after')
   * @returns Calculated insertion index
   */
  function calculateInsertionIndex(
    siblings: readonly BuilderNode[],
    targetNodeId: string,
    position: "before" | "after",
  ): number {
    const targetIndex = siblings.findIndex((n) => n.id === targetNodeId);

    if (targetIndex === -1) {
      // Target not found, append to end
      return siblings.length;
    }

    return position === "before" ? targetIndex : targetIndex + 1;
  }

  /**
   * Remove a node from its current location in the tree.
   *
   * @param nodes - Node tree
   * @param nodeId - ID of node to remove
   * @returns New tree with node removed, and the removed node
   */
  function extractNode(
    nodes: readonly BuilderNode[],
    nodeId: string,
  ): { tree: BuilderNode[]; node: BuilderNode | null } {
    let extractedNode: BuilderNode | null = null;

    function removeFromArray(arr: readonly BuilderNode[]): BuilderNode[] {
      return arr
        .filter((node) => {
          if (node.id === nodeId) {
            extractedNode = node;
            return false;
          }
          return true;
        })
        .map((node) => {
          if (node.children && node.children.length > 0) {
            return {
              ...node,
              children: removeFromArray(node.children),
            };
          }
          return node;
        });
    }

    const tree = removeFromArray(nodes);
    return { tree, node: extractedNode };
  }

  /**
   * Insert a node at a specific location in the tree.
   *
   * @param nodes - Node tree
   * @param nodeToInsert - Node to insert
   * @param parentId - Parent node ID (null for root)
   * @param index - Insertion index
   * @returns New tree with node inserted
   */
  function insertNode(
    nodes: readonly BuilderNode[],
    nodeToInsert: BuilderNode,
    parentId: string | null,
    index: number,
  ): BuilderNode[] {
    if (parentId === null) {
      const newTree = [...nodes];
      newTree.splice(index, 0, nodeToInsert);
      return newTree;
    }

    // Insert as child of parent node
    function insertIntoParent(arr: readonly BuilderNode[]): BuilderNode[] {
      return arr.map((node) => {
        if (node.id === parentId) {
          const newChildren = [...(node.children || [])];
          newChildren.splice(index, 0, nodeToInsert);
          return {
            ...node,
            children: newChildren,
          };
        }

        if (node.children && node.children.length > 0) {
          return {
            ...node,
            children: insertIntoParent(node.children),
          };
        }

        return node;
      });
    }

    return insertIntoParent(nodes);
  }

  /**
   * Execute a node reorder operation.
   *
   * @param params - Reorder parameters
   * @returns Reorder result with new tree
   */
  function reorderNodes(params: {
    nodes: readonly BuilderNode[];
    draggedNodeId: string;
    targetNodeId: string;
    position: DropPosition;
  }): ReorderResult {
    const { nodes, draggedNodeId, targetNodeId, position } = params;

    if (debug) {
      log("debug", "[useTreeSorting] Executing reorder", {
        draggedNodeId,
        targetNodeId,
        position,
      });
    }

    // Extract the dragged node
    const { tree: treeWithoutDragged, node: draggedNode } = extractNode(
      nodes,
      draggedNodeId,
    );

    if (!draggedNode) {
      return {
        success: false,
        newTree: nodes,
        error: "Dragged node not found",
      };
    }

    // Find target node in the new tree
    const targetNode = findNodeById(treeWithoutDragged, targetNodeId);

    if (!targetNode) {
      return {
        success: false,
        newTree: nodes,
        error: "Target node not found",
      };
    }

    let newTree: BuilderNode[];

    if (position === "inside") {
      // Insert as child of target node
      const index = targetNode.children ? targetNode.children.length : 0;
      newTree = insertNode(
        treeWithoutDragged,
        draggedNode,
        targetNodeId,
        index,
      );
    } else {
      const targetParent = findParentNode(treeWithoutDragged, targetNodeId);
      const targetParentId = targetParent?.id || null;
      const siblings =
        targetParentId === null
          ? treeWithoutDragged
          : targetParent?.children || [];

      const insertionIndex = calculateInsertionIndex(
        siblings,
        targetNodeId,
        position,
      );

      newTree = insertNode(
        treeWithoutDragged,
        draggedNode,
        targetParentId,
        insertionIndex,
      );
    }

    if (debug) {
      log("debug", "[useTreeSorting] Reorder completed successfully", {
        draggedNodeId,
        targetNodeId,
        position,
      });
    }

    return {
      success: true,
      newTree,
    };
  }

  /**
   * Create a drag operation descriptor from params.
   *
   * @param params - Operation parameters
   * @returns Drag operation object
   */
  function createDragOperation(params: {
    draggedNodeId: string;
    sourceParentId: string | null;
    sourceIndex: number;
    targetNodeId: string;
    targetParentId: string | null;
    targetIndex: number;
    position: DropPosition;
  }): DragOperation {
    return {
      draggedNodeId: params.draggedNodeId,
      sourceParentId: params.sourceParentId,
      sourceIndex: params.sourceIndex,
      targetParentId: params.targetParentId,
      targetSiblingId: params.targetNodeId,
      targetIndex: params.targetIndex,
      position: params.position,
    };
  }

  return {
    reorderNodes,
    extractNode,
    insertNode,

    calculateInsertionIndex,
    createDragOperation,
  };
}
