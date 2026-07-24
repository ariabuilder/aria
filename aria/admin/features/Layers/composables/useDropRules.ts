/**
 * Validates drag-drop operations to prevent invalid tree structures.
 * Part of the micro-composable split from useNodeValidation.
 */

import { z } from "zod";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type { DropValidation, DropPosition } from "../types";
import { VALIDATION_ERROR_CODES } from "../types";
import { log } from "@/lib/utils/logger";
import {
  isDescendant,
  canHaveChildren as nodeCanHaveChildren,
} from "../utils/nodeHelpers";
import { useSchemaRules } from "./useSchemaRules";

const DropPositionSchema = z.enum(["before", "after", "inside"]);

const DropRuleParamsSchema = z
  .object({
    draggedNodeId: z.string().trim().min(1).nullable(),
    targetNodeId: z.string().trim().min(1),
    position: DropPositionSchema,
  })
  .strict();

function resolveNodeById(
  nodes: readonly BuilderNode[],
  nodeId: string,
): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    if (node.children?.length) {
      const resolvedChildNode = resolveNodeById(node.children, nodeId);
      if (resolvedChildNode) {
        return resolvedChildNode;
      }
    }
  }

  return null;
}

/**
 * Drop validation rules for drag-drop operations.
 *
 * Prevents invalid drops (self-drops, descendant drops, leaf node children).
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * const dropRules = useDropRules({ allowLeafChildren: false });
 *
 * // Validate a drop operation
 * const validation = dropRules.canDrop({
 *   draggedNodeId: sourceNode.id,
 *   targetNodeId: destNode.id,
 *   position: 'inside',
 *   allNodes: pageBlocks
 * });
 *
 * if (!validation.valid) {
 *   console.error(validation.reason);
 * }
 * ```
 */
export function useDropRules(
  options: {
    allowLeafChildren?: boolean;
    debug?: boolean;
    customValidator?: (
      dragNode: BuilderNode,
      targetNode: BuilderNode,
    ) => DropValidation;
  } = {},
) {
  const { allowLeafChildren = false, debug = false, customValidator } = options;

  const schemaRules = useSchemaRules();

  /**
   * Check if dropping a node on itself.
   *
   * @param draggedNodeId - ID of dragged node
   * @param targetNodeId - ID of target node
   * @returns True if invalid (same node)
   */
  function isDropOnSelf(draggedNodeId: string, targetNodeId: string): boolean {
    return draggedNodeId === targetNodeId;
  }

  /**
   * Check if dropping a node on its descendant.
   *
   * @param draggedNodeId - Dragged node id
   * @param targetNodeId - ID of target node
   * @param allNodes - All nodes in the tree
   * @returns True if invalid (target is descendant)
   */
  function isDropOnDescendant(
    draggedNodeId: string,
    targetNodeId: string,
    allNodes: readonly BuilderNode[],
  ): boolean {
    const draggedNode = resolveNodeById(allNodes, draggedNodeId);
    if (draggedNode?.children && draggedNode.children.length > 0) {
      return isDescendant(allNodes, targetNodeId, draggedNodeId);
    }
    return false;
  }

  /**
   * Check if target node can accept children.
   *
   * @param targetNode - Target node
   * @returns True if target can have children
   */
  function targetCanHaveChildren(targetNode: BuilderNode): boolean {
    const schemaAllowsChildren = schemaRules.canHaveChildren(targetNode.type);

    if (!schemaAllowsChildren && !allowLeafChildren) {
      return false;
    }

    // Check if node is structurally a container
    return nodeCanHaveChildren(targetNode);
  }

  /**
   * Validate a drop operation.
   *
   * @param params - Drop validation parameters
   * @returns Validation result
   */
  function canDrop(params: {
    draggedNodeId: string | null;
    targetNodeId: string;
    position: DropPosition;
    allNodes: readonly BuilderNode[];
  }): DropValidation {
    const parsedParams = DropRuleParamsSchema.safeParse({
      draggedNodeId: params.draggedNodeId,
      targetNodeId: params.targetNodeId,
      position: params.position,
    });

    if (!parsedParams.success) {
      if (debug) {
        log("warn", "[useDropRules] Invalid drop validation params", {
          issues: parsedParams.error.issues,
        });
      }

      return {
        valid: false,
        reason: "Invalid drop validation parameters",
        code: VALIDATION_ERROR_CODES.CUSTOM_VALIDATION_FAILED,
      };
    }

    const { draggedNodeId, targetNodeId, position } = parsedParams.data;
    const { allNodes } = params;

    // No drag in progress
    if (!draggedNodeId) {
      return {
        valid: false,
        reason: "No drag operation in progress",
        code: VALIDATION_ERROR_CODES.NO_DRAG,
      };
    }

    const draggedNode = resolveNodeById(allNodes, draggedNodeId);
    if (!draggedNode) {
      return {
        valid: false,
        reason: "Dragged node not found",
        code: VALIDATION_ERROR_CODES.NO_DRAG,
      };
    }

    const targetNode = resolveNodeById(allNodes, targetNodeId);
    if (!targetNode) {
      return {
        valid: false,
        reason: "Target node not found",
        code: VALIDATION_ERROR_CODES.CUSTOM_VALIDATION_FAILED,
      };
    }

    // Check for drop on self
    if (isDropOnSelf(draggedNodeId, targetNodeId)) {
      if (debug) {
        log("warn", "[useDropRules] Cannot drop node on itself", {
          draggedNodeId,
          targetNodeId,
        });
      }
      return {
        valid: false,
        reason: "Cannot drop a node on itself",
        code: VALIDATION_ERROR_CODES.DROP_ON_SELF,
      };
    }

    // Check for drop on descendant
    if (isDropOnDescendant(draggedNodeId, targetNodeId, allNodes)) {
      if (debug) {
        log("warn", "[useDropRules] Cannot drop node on its descendant", {
          draggedNodeId,
          targetNodeId,
        });
      }
      return {
        valid: false,
        reason: "Cannot drop a node on its descendant",
        code: VALIDATION_ERROR_CODES.DROP_ON_DESCENDANT,
      };
    }

    // For "inside" drops, check if target can have children
    if (position === "inside") {
      if (!targetCanHaveChildren(targetNode)) {
        if (debug) {
          log("warn", "[useDropRules] Target node cannot have children", {
            targetNodeType: targetNode.type,
            targetNodeId: targetNode.id,
          });
        }
        return {
          valid: false,
          reason: `Node type "${targetNode.type}" cannot have children`,
          code: VALIDATION_ERROR_CODES.TARGET_NO_CHILDREN,
        };
      }
    }

    // Run custom validator if provided
    if (customValidator) {
      const customResult = customValidator(draggedNode, targetNode);
      if (!customResult.valid) {
        if (debug) {
          log("warn", "[useDropRules] Custom validation failed", {
            reason: customResult.reason,
            code: customResult.code,
          });
        }
        return {
          ...customResult,
          code:
            customResult.code ||
            VALIDATION_ERROR_CODES.CUSTOM_VALIDATION_FAILED,
        };
      }
    }

    if (debug) {
      log("debug", "[useDropRules] Drop validation passed", {
        draggedNode: draggedNode.id,
        targetNode: targetNode.id,
        position,
      });
    }

    return { valid: true };
  }

  /**
   * Full drop validation (schema, slots, and custom rules).
   *
   * @param targetNode - Target node to validate
   * @param draggedNode - Node being dragged (optional for pre-validation)
   * @param position - Drop position
   * @param allNodes - Full node tree
   * @returns True if target is valid
   */
  function isValidDropTarget(
    targetNodeId: string,
    draggedNodeId: string | null,
    position: DropPosition,
    allNodes: readonly BuilderNode[],
  ): boolean {
    if (!draggedNodeId) {
      return false;
    }

    const validation = canDrop({
      draggedNodeId,
      targetNodeId,
      position,
      allNodes,
    });
    return validation.valid;
  }

  /**
   * Validate multiple drops (batch validation).
   *
   * @param operations - Array of drop operations to validate
   * @returns Array of validation results
   */
  function validateDrops(
    operations: ReadonlyArray<{
      draggedNodeId: string | null;
      targetNodeId: string;
      position: DropPosition;
      allNodes: readonly BuilderNode[];
    }>,
  ): readonly DropValidation[] {
    return operations.map((op) => canDrop(op));
  }

  /**
   * Get allowed drop positions for a target node.
   *
   * @param targetNode - Target node
   * @returns Array of allowed drop positions
   */
  function getAllowedPositions(
    targetNode: BuilderNode,
  ): readonly DropPosition[] {
    const positions: DropPosition[] = ["before", "after"];

    if (targetCanHaveChildren(targetNode)) {
      positions.push("inside");
    }

    return positions;
  }

  /**
   * Check if a specific position is allowed for a target.
   *
   * @param targetNode - Target node
   * @param position - Drop position to check
   * @returns True if position is allowed
   */
  function isPositionAllowed(
    targetNode: BuilderNode,
    position: DropPosition,
  ): boolean {
    const allowed = getAllowedPositions(targetNode);
    return allowed.includes(position);
  }

  return {
    canDrop,
    validateDrops,
    isDropOnSelf,
    isDropOnDescendant,
    targetCanHaveChildren,
    isValidDropTarget,

    getAllowedPositions,
    isPositionAllowed,
  };
}
