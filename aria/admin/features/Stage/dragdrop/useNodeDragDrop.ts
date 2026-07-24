import { ref, computed, readonly } from "vue";
import { z } from "zod";
import type { BuilderNode } from "../../../../lib/types/nodes";

type DropPosition = "before" | "after" | "inside";

type DropIndicatorClass = "drop-before" | "drop-after" | "drop-inside" | "";

interface DragState {
  nodeId: string;
  nodeType: string;
  /** null when the drag source is a root node */
  sourceParentId: string | null;
  sourceIndex: number;
  startTime: number;
}

interface DropValidation {
  valid: boolean;
  reason?: string;
  code?: string;
}

interface DragOperation {
  draggedNodeId: string;
  sourceParentId: string | null;
  sourceIndex: number;
  targetParentId: string | null;
  /** Sibling used for before/after placement */
  targetSiblingId: string | null;
  targetIndex: number;
  position: DropPosition;
}

interface DragDropOptions {
  debug?: boolean;
  allowLeafNodeChildren?: boolean;
  customValidator?: (
    dragNode: { nodeId: string; nodeType: string },
    targetNode: BuilderNode,
  ) => DropValidation;
  trackStats?: boolean;
}

interface DragDropStats {
  totalDrags: number;
  successfulDrops: number;
  cancelledDrags: number;
  averageDragDuration: number;
  lastDragTime: number | null;
}

const DEFAULT_OPTIONS: Required<Omit<DragDropOptions, "customValidator">> = {
  debug: false,
  allowLeafNodeChildren: false,
  trackStats: false,
};

const LEAF_NODE_TYPES = new Set([
  "Image",
  "Icon",
  "Text",
  "Input",
  "Video",
  "Hr",
  "Br",
]);

const VALIDATION_ERROR_CODES = {
  NO_DRAG: "NO_DRAG_IN_PROGRESS",
  DROP_ON_SELF: "DROP_ON_SELF",
  DROP_ON_DESCENDANT: "DROP_ON_DESCENDANT",
  TARGET_NO_CHILDREN: "TARGET_CANNOT_HAVE_CHILDREN",
  CUSTOM_VALIDATION_FAILED: "CUSTOM_VALIDATION_FAILED",
} as const;

const VALIDATION_MESSAGES = {
  NO_DRAG: "No drag operation in progress",
  DROP_ON_SELF: "Cannot drop a node on itself",
  DROP_ON_DESCENDANT: "Cannot drop a node on its descendant",
  TARGET_NO_CHILDREN: "Target node cannot have children",
  CUSTOM_VALIDATION_FAILED: "Custom validation failed",
  INVALID_DRAG_INPUT: "Invalid drag input",
} as const;

const DragStartParamsSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    nodeType: z.string().trim().min(1),
    sourceParentId: z.string().trim().min(1).nullable(),
    sourceIndex: z.int().nonnegative(),
  })
  .strict();

/**
 * Drop indicator class names.
 */
const DROP_INDICATOR_CLASSES: Record<DropPosition, DropIndicatorClass> = {
  before: "drop-before",
  after: "drop-after",
  inside: "drop-inside",
} as const;

/**
 * Validates that a node ID is non-empty and valid.
 *
 * @param nodeId - Node ID to validate
 * @returns True if valid node ID
 */
function isValidNodeId(nodeId: unknown): nodeId is string {
  return typeof nodeId === "string" && nodeId.trim().length > 0;
}

/**
 * Validates that a value is a valid BuilderNode.
 *
 * @param node - Value to validate
 * @returns True if valid BuilderNode
 */
function isValidNode(node: unknown): node is BuilderNode {
  if (!node || typeof node !== "object") return false;
  const n = node as BuilderNode;
  return isValidNodeId(n.id) && typeof n.type === "string";
}

/**
 * Validates that a drop position is valid.
 *
 * @param position - Position to validate
 * @returns True if valid drop position
 */
function isValidDropPosition(position: unknown): position is DropPosition {
  return position === "before" || position === "after" || position === "inside";
}

/**
 * Validates that an index is a non-negative integer.
 *
 * @param index - Index to validate
 * @returns True if valid index
 */
function isValidIndex(index: unknown): index is number {
  return typeof index === "number" && index >= 0 && Number.isInteger(index);
}

/**
 * Checks if a node type is a leaf node (cannot have children).
 *
 * @param nodeType - Node type to check
 * @param allowLeafNodeChildren - Whether to allow leaf nodes to have children
 * @returns True if node is a leaf type
 */
function isLeafNodeType(
  nodeType: string,
  allowLeafNodeChildren: boolean,
): boolean {
  if (allowLeafNodeChildren) return false;
  return LEAF_NODE_TYPES.has(nodeType);
}

/**
 * Recursively checks if a node contains a descendant with given ID.
 *
 * @param node - Node to search
 * @param ancestorId - ID to search for
 * @returns True if ancestorId is found in node's descendants
 */

/**
 * Drag-drop manager for hierarchical node trees in Aria builder.
 *
 * Drag-drop for moving/reordering nodes in the tree.
 * Prevents invalid operations like dropping into self or descendants.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * const dragDrop = useNodeDragDrop({ debug: true });
 *
 * // Start dragging
 * dragDrop.startDrag('node-123', 'Container', 'parent-456', 2);
 *
 * // Set drop target
 * dragDrop.setDropTarget('target-789', 'inside');
 *
 * // Validate drop
 * const validation = dragDrop.canDropOn('target-789', targetNode, (node) => false);
 * if (validation.valid) {
 *   const operation = dragDrop.getDragOperation();
 *   // Perform drop...
 * }
 *
 * // End drag
 * dragDrop.endDrag();
 * ```
 */
export function useNodeDragDrop(options: DragDropOptions = {}) {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const { debug, allowLeafNodeChildren, customValidator, trackStats } =
    mergedOptions;

  /**
   * Current drag state (null when not dragging).
   */
  const dragState = ref<DragState | null>(null);

  /**
   * Current drop target node ID.
   */
  const dropTargetId = ref<string | null>(null);

  /**
   * Current drop position relative to target.
   */
  const dropPosition = ref<DropPosition>("inside");

  /**
   * Drag-drop statistics.
   */
  const stats = ref<DragDropStats>({
    totalDrags: 0,
    successfulDrops: 0,
    cancelledDrags: 0,
    averageDragDuration: 0,
    lastDragTime: null,
  });

  /**
   * Last validation result.
   */
  const lastValidation = ref<DropValidation | null>(null);

  /**
   * Whether a drag operation is currently in progress.
   */
  const isDragging = computed<boolean>(() => {
    return dragState.value !== null;
  });

  /**
   * Whether a drop target is currently set.
   */
  const hasDropTarget = computed<boolean>(() => {
    return dropTargetId.value !== null;
  });

  /**
   * Whether current drop target is valid.
   */
  const isDropValid = computed<boolean>(() => {
    return lastValidation.value?.valid ?? false;
  });

  /**
   * Current drag operation if in progress.
   */
  const currentDragState = computed<DragState | null>(() => {
    return dragState.value;
  });

  /**
   * Current drop target ID.
   */
  const currentDropTarget = computed<string | null>(() => {
    return dropTargetId.value;
  });

  /**
   * Current drop position.
   */
  const currentDropPosition = computed<DropPosition>(() => {
    return dropPosition.value;
  });

  /**
   * Duration of current drag in milliseconds.
   */
  const currentDragDuration = computed<number>(() => {
    if (!dragState.value) return 0;
    return Date.now() - dragState.value.startTime;
  });

  /**
   * Drag-drop statistics summary.
   */
  const dragDropStats = computed<DragDropStats>(() => {
    return { ...stats.value };
  });

  /**
   * Success rate percentage.
   */
  const successRate = computed<number>(() => {
    if (stats.value.totalDrags === 0) return 100;
    const completed = stats.value.successfulDrops + stats.value.cancelledDrags;
    if (completed === 0) return 100;
    return Math.round((stats.value.successfulDrops / completed) * 100);
  });

  /**
   * Starts a drag operation.
   *
   * @param nodeId - ID of node being dragged
   * @param node - The node being dragged
   * @param sourceParentId - Parent ID at source location (null for root)
   * @param sourceIndex - Original index in parent's children
   * @returns True if drag started successfully
   *
   * @example
   * ```ts
 * const success = startDrag('node-123', 'Container', 'parent-456', 2);
   * if (success) {
   *   console.log('Drag started');
   * }
   * ```
   */
  function startDrag(
    nodeId: string,
    nodeType: string,
    sourceParentId: string | null,
    sourceIndex: number,
  ): boolean {
    const parsedParams = DragStartParamsSchema.safeParse({
      nodeId,
      nodeType,
      sourceParentId,
      sourceIndex,
    });
    if (!parsedParams.success) {
      console.error("[useNodeDragDrop] Invalid drag input", parsedParams.error.issues);
      return false;
    }

    const validatedParams = parsedParams.data;

    dragState.value = {
      nodeId: validatedParams.nodeId,
      nodeType: validatedParams.nodeType,
      sourceParentId: validatedParams.sourceParentId,
      sourceIndex: validatedParams.sourceIndex,
      startTime: Date.now(),
    };

    if (trackStats) {
      stats.value.totalDrags++;
      stats.value.lastDragTime = Date.now();
    }

    if (debug) {
      console.log("[useNodeDragDrop] Drag started:", {
        nodeId: validatedParams.nodeId,
        nodeType: validatedParams.nodeType,
        sourceParentId: validatedParams.sourceParentId,
        sourceIndex: validatedParams.sourceIndex,
      });
    }

    return true;
  }

  /**
   * Ends a drag operation.
   *
   * @param successful - Whether the drag resulted in a successful drop
   *
   * @example
   * ```ts
   * endDrag(true); // Successful drop
   * endDrag(false); // Cancelled
   * ```
   */
  function endDrag(successful: boolean = false): void {
    if (!dragState.value) {
      if (debug) {
        console.warn("[useNodeDragDrop] No drag to end");
      }
      return;
    }

    const duration = Date.now() - dragState.value.startTime;

    if (trackStats) {
      if (successful) {
        stats.value.successfulDrops++;
      } else {
        stats.value.cancelledDrags++;
      }

      const totalCompleted =
        stats.value.successfulDrops + stats.value.cancelledDrags;
      const currentAvg = stats.value.averageDragDuration;
      stats.value.averageDragDuration = Math.round(
        (currentAvg * (totalCompleted - 1) + duration) / totalCompleted,
      );
    }

    if (debug) {
      console.log("[useNodeDragDrop] Drag ended:", {
        successful,
        duration: `${duration}ms`,
      });
    }

    dragState.value = null;
    dropTargetId.value = null;
    dropPosition.value = "inside";
    lastValidation.value = null;
  }

  /**
   * Cancels the current drag operation.
   *
   * @example
   * ```ts
   * cancelDrag(); // Cancel without dropping
   * ```
   */
  function cancelDrag(): void {
    endDrag(false);
  }

  /**
   * Sets the current drop target and position.
   *
   * @param targetId - Target node ID (null to clear)
   * @param position - Drop position relative to target
   *
   * @example
   * ```ts
   * setDropTarget('target-123', 'before'); // Drop before target
   * setDropTarget('target-123', 'inside'); // Drop as child of target
   * setDropTarget(null); // Clear drop target
   * ```
   */
  function setDropTarget(
    targetId: string | null,
    position: DropPosition = "inside",
  ): void {
    if (position && !isValidDropPosition(position)) {
      console.error("[useNodeDragDrop] Invalid drop position:", position);
      return;
    }

    dropTargetId.value = targetId;
    dropPosition.value = position;

    if (debug && targetId) {
      console.log("[useNodeDragDrop] Drop target set:", { targetId, position });
    }
  }

  /**
   * Clears the current drop target.
   *
   * @example
   * ```ts
   * clearDropTarget(); // Remove drop target highlight
   * ```
   */
  function clearDropTarget(): void {
    dropTargetId.value = null;
    dropPosition.value = "inside";
    lastValidation.value = null;

    if (debug) {
      console.log("[useNodeDragDrop] Drop target cleared");
    }
  }

  /**
   * Validates whether current drag can be dropped on target node.
   *
   * @param targetId - Target node ID
   * @param targetNode - Target node instance
   * @returns Validation result with reason if invalid
   *
   * @example
   * ```ts
   * const validation = canDropOn('target-123', targetNode);
   * if (!validation.valid) {
   *   console.error(validation.reason);
   * }
   * ```
   */
  function canDropOn(
    targetId: string,
    targetNode: BuilderNode,
    isTargetDescendant?: (ancestorId: string, targetId: string) => boolean,
  ): DropValidation {
    // Check if drag is in progress
    if (!dragState.value) {
      const result: DropValidation = {
        valid: false,
        reason: VALIDATION_MESSAGES.NO_DRAG,
        code: VALIDATION_ERROR_CODES.NO_DRAG,
      };
      lastValidation.value = result;
      return result;
    }

    const { nodeId, nodeType } = dragState.value;

    if (!isValidNodeId(targetId) || !isValidNode(targetNode)) {
      const result: DropValidation = {
        valid: false,
        reason: VALIDATION_MESSAGES.INVALID_DRAG_INPUT,
        code: VALIDATION_ERROR_CODES.CUSTOM_VALIDATION_FAILED,
      };
      lastValidation.value = result;
      return result;
    }

    // Can't drop on self
    if (targetId === nodeId) {
      const result: DropValidation = {
        valid: false,
        reason: VALIDATION_MESSAGES.DROP_ON_SELF,
        code: VALIDATION_ERROR_CODES.DROP_ON_SELF,
      };
      lastValidation.value = result;
      return result;
    }

    // Can't drop on descendant
    if (isTargetDescendant?.(nodeId, targetId)) {
      const result: DropValidation = {
        valid: false,
        reason: VALIDATION_MESSAGES.DROP_ON_DESCENDANT,
        code: VALIDATION_ERROR_CODES.DROP_ON_DESCENDANT,
      };
      lastValidation.value = result;
      return result;
    }

    // Check if target accepts children (for "inside" drop)
    if (dropPosition.value === "inside") {
      const canHaveChildren = !isLeafNodeType(
        targetNode.type,
        allowLeafNodeChildren,
      );

      if (!canHaveChildren) {
        const result: DropValidation = {
          valid: false,
          reason: VALIDATION_MESSAGES.TARGET_NO_CHILDREN,
          code: VALIDATION_ERROR_CODES.TARGET_NO_CHILDREN,
        };
        lastValidation.value = result;
        return result;
      }
    }

    // Run custom validation if provided
    if (customValidator) {
      const customResult = customValidator({ nodeId, nodeType }, targetNode);

      if (!customResult.valid) {
        const result: DropValidation = {
          valid: false,
          reason:
            customResult.reason || VALIDATION_MESSAGES.CUSTOM_VALIDATION_FAILED,
          code:
            customResult.code ||
            VALIDATION_ERROR_CODES.CUSTOM_VALIDATION_FAILED,
        };
        lastValidation.value = result;
        return result;
      }
    }

    const result: DropValidation = { valid: true };
    lastValidation.value = result;
    return result;
  }

  /**
   * Validates drop without storing validation result.
   *
   * @param targetId - Target node ID
   * @param targetNode - Target node instance
   * @returns True if drop is valid
   */
  function isValidDropTarget(
    targetId: string,
    targetNode: BuilderNode,
    isTargetDescendant?: (ancestorId: string, targetId: string) => boolean,
  ): boolean {
    const validation = canDropOn(targetId, targetNode, isTargetDescendant);
    return validation.valid;
  }

  /**
   * Gets complete drag operation details for execution.
   *
   * @param targetSiblingId - Sibling node ID for before/after drops
   * @param targetParentChildren - Children array of target parent
   * @param targetSiblingIndex - Index of target sibling in parent
   * @returns Complete operation details or null if no drag in progress
   *
   * @example
   * ```ts
   * const operation = getDragOperation('sibling-123', parentChildren, 2);
   * if (operation) {
   *   // Execute the move operation
   *   performMove(operation);
   * }
   * ```
   */
  function getDragOperation(
    _targetSiblingId?: string,
    targetParentChildren?: BuilderNode[],
    targetSiblingIndex?: number,
  ): DragOperation | null {
    if (!dragState.value || !dropTargetId.value) {
      return null;
    }

    let targetParentId: string | null;
    let targetIndex: number;

    if (dropPosition.value === "inside") {
      // Dropping as child of target
      targetParentId = dropTargetId.value;
      targetIndex = 0; // Will be recalculated based on target's children
    } else {
      // Dropping before/after target (target is a sibling)
      targetParentId = null; // Will need to be determined by caller

      // Calculate index based on position
      if (targetParentChildren && isValidIndex(targetSiblingIndex)) {
        targetIndex = calculateDropIndex(
          targetParentChildren,
          targetSiblingIndex!,
        );
      } else {
        targetIndex = 0;
      }
    }

    const operation: DragOperation = {
      draggedNodeId: dragState.value.nodeId,
      sourceParentId: dragState.value.sourceParentId,
      sourceIndex: dragState.value.sourceIndex,
      targetParentId,
      targetSiblingId:
        dropPosition.value !== "inside" ? dropTargetId.value : null,
      targetIndex,
      position: dropPosition.value,
    };

    if (debug) {
      console.log("[useNodeDragDrop] Drag operation:", operation);
    }

    return operation;
  }

  /**
   * Calculates drop index based on position and target sibling.
   *
   * @param targetParentChildren - Children of target parent
   * @param targetSiblingIndex - Index of target sibling
   * @returns Calculated insertion index
   *
   * @example
   * ```ts
   * const index = calculateDropIndex(parentChildren, 2);
   * // Returns 2 for 'before', 3 for 'after', children.length for 'inside'
   * ```
   */
  function calculateDropIndex(
    targetParentChildren: BuilderNode[],
    targetSiblingIndex: number,
  ): number {
    if (!isValidIndex(targetSiblingIndex)) {
      console.error("[useNodeDragDrop] Invalid target sibling index");
      return 0;
    }

    switch (dropPosition.value) {
      case "before":
        return targetSiblingIndex;
      case "after":
        return targetSiblingIndex + 1;
      case "inside":
        return targetParentChildren.length;
      default:
        return 0;
    }
  }

  /**
   * Checks if a specific node is currently being dragged.
   *
   * @param nodeId - Node ID to check
   * @returns True if this node is being dragged
   *
   * @example
   * ```ts
   * const dragging = isNodeDragging('node-123');
   * ```
   */
  function isNodeDragging(nodeId: string): boolean {
    return dragState.value?.nodeId === nodeId;
  }

  /**
   * Checks if a specific drop zone should be highlighted.
   *
   * @param nodeId - Node ID to check
   * @param position - Drop position to check
   * @returns True if this drop zone is active
   *
   * @example
   * ```ts
   * const active = isDropZoneActive('target-123', 'before');
   * ```
   */
  function isDropZoneActive(nodeId: string, position: DropPosition): boolean {
    return (
      isDragging.value &&
      dropTargetId.value === nodeId &&
      dropPosition.value === position
    );
  }

  /**
   * Gets CSS class name for drop indicator.
   *
   * @param nodeId - Node ID to get indicator for
   * @returns Drop indicator class name or empty string
   *
   * @example
   * ```ts
   * const className = getDropIndicatorClass('target-123');
   * // Returns 'drop-before', 'drop-after', 'drop-inside', or ''
   * ```
   */
  function getDropIndicatorClass(nodeId: string): DropIndicatorClass {
    if (!isDragging.value || dropTargetId.value !== nodeId) {
      return "";
    }

    return DROP_INDICATOR_CLASSES[dropPosition.value];
  }

  /**
   * Checks if a node can be a drop target based on its type.
   *
   * @param nodeType - Node type to check
   * @returns True if node type can accept children
   */
  function canNodeTypeHaveChildren(nodeType: string): boolean {
    return !isLeafNodeType(nodeType, allowLeafNodeChildren);
  }

  /**
   * Resets drag-drop statistics.
   *
   * @example
   * ```ts
   * resetStats(); // Clear all statistics
   * ```
   */
  function resetStats(): void {
    stats.value = {
      totalDrags: 0,
      successfulDrops: 0,
      cancelledDrags: 0,
      averageDragDuration: 0,
      lastDragTime: null,
    };

    if (debug) {
      console.log("[useNodeDragDrop] Statistics reset");
    }
  }

  return {
    // State (readonly to prevent external mutations)
    dragState: readonly(dragState),
    dropTargetId: readonly(dropTargetId),
    dropPosition: readonly(dropPosition),
    stats: readonly(stats),
    lastValidation: readonly(lastValidation),

    isDragging,
    hasDropTarget,
    isDropValid,
    currentDragState,
    currentDropTarget,
    currentDropPosition,
    currentDragDuration,
    dragDropStats,
    successRate,

    startDrag,
    endDrag,
    cancelDrag,

    setDropTarget,
    clearDropTarget,

    canDropOn,
    isValidDropTarget,

    getDragOperation,
    calculateDropIndex,

    isNodeDragging,
    isDropZoneActive,
    getDropIndicatorClass,
    canNodeTypeHaveChildren,

    resetStats,
  };
}
