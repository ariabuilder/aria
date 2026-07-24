/**
 * Drag operation state (what's being dragged, from where).
 * Part of the micro-composable split from useNodeDragDrop.
 */

import { ref, readonly, computed, type ComputedRef } from "vue";
import { z } from "zod";
import type { DragState, DragSource, DragDropStats } from "../types";
import { log } from "@/lib/utils/logger";

const DragStartParamsSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    nodeType: z.string().trim().min(1),
    sourceParentId: z.string().trim().min(1).nullable(),
    sourceIndex: z.int().nonnegative(),
    source: z.enum(["add-elements", "components", "canvas", "layers"]),
  })
  .strict();

/**
 * Drag state management for node tree drag-drop.
 *
 * Tracks what's being dragged, source location, and drag statistics.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * const dragState = useDragState({ trackStats: true });
 *
 * // Start dragging
 * dragState.startDrag({
 *   nodeId: 'node-123',
 *   nodeType: 'Button',
 *   sourceParentId: 'parent-456',
 *   sourceIndex: 2,
 *   source: 'layers'
 * });
 *
 * // Check drag state
 * if (dragState.isDragging.value) {
 *   console.log('Dragging:', dragState.draggedNodeId.value);
 * }
 *
 * // End drag
 * dragState.endDrag(true); // success=true
 * ```
 */
export function useDragState(
  options: {
    trackStats?: boolean;
    debug?: boolean;
  } = {},
) {
  const { trackStats = false, debug = false } = options;

  /**
   * Current drag state (null when not dragging)
   */
  const currentDragState = ref<DragState | null>(null);

  /**
   * Drag statistics (if enabled)
   */
  const stats = ref<DragDropStats>({
    totalDrags: 0,
    successfulDrops: 0,
    cancelledDrags: 0,
    averageDragDuration: 0,
    lastDragTime: null,
  });

  /**
   * Whether a drag operation is in progress
   */
  const isDragging = computed<boolean>(() => currentDragState.value !== null);

  /**
   * ID of the node being dragged (null if not dragging)
   */
  const draggedNodeId = computed<string | null>(
    () => currentDragState.value?.nodeId || null,
  );

  /**
   * Type of the node being dragged (null if not dragging)
   */
  const draggedNodeType = computed<string | null>(
    () => currentDragState.value?.nodeType || null,
  );

  /**
   * Source parent ID (null if dragging from root or not dragging)
   */
  const sourceParentId = computed<string | null>(
    () => currentDragState.value?.sourceParentId || null,
  );

  /**
   * Original index in source parent's children
   */
  const sourceIndex = computed<number | null>(
    () => currentDragState.value?.sourceIndex ?? null,
  );

  /**
   * Source of the drag operation
   */
  const dragSource = computed<DragSource>(
    () => currentDragState.value?.source || null,
  );

  /**
   * Duration of current drag in milliseconds (or null if not dragging)
   */
  const dragDuration = computed<number | null>(() => {
    if (!currentDragState.value) {
      return null;
    }
    return Date.now() - currentDragState.value.startTime;
  });

  /**
   * Start a drag operation.
   *
   * @param params - Drag start parameters
   */
  function startDrag(params: {
    nodeId: string;
    nodeType: string;
    sourceParentId: string | null;
    sourceIndex: number;
    source: Exclude<DragSource, null>;
  }): void {
    const parsedParams = DragStartParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      if (debug) {
        log("warn", "[useDragState] Invalid drag start params", {
          issues: parsedParams.error.issues,
        });
      }
      return;
    }

    const { nodeId, nodeType, sourceParentId, sourceIndex, source } =
      parsedParams.data;

    currentDragState.value = {
      nodeId,
      nodeType,
      sourceParentId,
      sourceIndex,
      startTime: Date.now(),
      source,
    };

    if (trackStats) {
      stats.value.totalDrags++;
    }

    if (debug) {
      log("debug", "[useDragState] Started drag", {
        nodeId,
        nodeType,
        source,
        sourceParentId,
        sourceIndex,
      });
    }
  }

  /**
   * End the current drag operation.
   *
   * @param success - Whether the drag resulted in a successful drop
   */
  function endDrag(success: boolean = false): void {
    if (!currentDragState.value) {
      if (debug) {
        log("warn", "[useDragState] No drag to end");
      }
      return;
    }

    const duration = Date.now() - currentDragState.value.startTime;

    if (trackStats) {
      if (success) {
        stats.value.successfulDrops++;
      } else {
        stats.value.cancelledDrags++;
      }

      const totalCompleted =
        stats.value.successfulDrops + stats.value.cancelledDrags;
      const currentAvg = stats.value.averageDragDuration;
      stats.value.averageDragDuration =
        (currentAvg * (totalCompleted - 1) + duration) / totalCompleted;

      stats.value.lastDragTime = Date.now();
    }

    if (debug) {
      log("debug", "[useDragState] Ended drag", {
        nodeId: currentDragState.value.nodeId,
        success,
        duration: `${duration}ms`,
      });
    }

    currentDragState.value = null;
  }

  /**
   * Cancel the current drag operation.
   */
  function cancelDrag(): void {
    endDrag(false);
  }

  /**
   * Clear drag state (emergency cleanup).
   */
  function clearDragState(): void {
    currentDragState.value = null;

    if (debug) {
      log("debug", "[useDragState] Cleared drag state");
    }
  }

  /**
   * Reset statistics.
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
      log("debug", "[useDragState] Reset statistics");
    }
  }

  /**
   * Get current drag operation details.
   *
   * @returns Current drag state or null
   */
  function getDragState(): Readonly<DragState> | null {
    return currentDragState.value;
  }

  /**
   * Check if a specific node is currently being dragged.
   *
   * @param nodeId - Node ID to check
   * @returns True if this node is being dragged
   */
  function isNodeBeingDragged(nodeId: string): boolean {
    return currentDragState.value?.nodeId === nodeId;
  }

  return {
    // State (readonly)
    isDragging: readonly(isDragging) as Readonly<ComputedRef<boolean>>,
    draggedNodeId: readonly(draggedNodeId) as Readonly<
      ComputedRef<string | null>
    >,
    draggedNodeType: readonly(draggedNodeType) as Readonly<
      ComputedRef<string | null>
    >,
    sourceParentId: readonly(sourceParentId) as Readonly<
      ComputedRef<string | null>
    >,
    sourceIndex: readonly(sourceIndex) as Readonly<ComputedRef<number | null>>,
    dragSource: readonly(dragSource) as Readonly<ComputedRef<DragSource>>,
    dragDuration: readonly(dragDuration) as Readonly<
      ComputedRef<number | null>
    >,
    stats: readonly(stats),

    startDrag: readonly(startDrag),
    endDrag: readonly(endDrag),
    cancelDrag: readonly(cancelDrag),
    clearDragState: readonly(clearDragState),

    getDragState: readonly(getDragState),
    isNodeBeingDragged: readonly(isNodeBeingDragged),

    resetStats: readonly(resetStats),
  };
}
