/**
 * Drop zone highlighting and visual feedback during drag
 * operations. Part of the micro-composable split from useNodeDragDrop.
 */

import { ref, readonly, computed, type ComputedRef } from "vue";
import type { DropPosition, DropIndicatorClass, DropTarget } from "../types";
import { log } from "@/lib/utils/logger";

/**
 * Drop indicator class names
 */
const DROP_INDICATOR_CLASSES: Readonly<
  Record<DropPosition, DropIndicatorClass>
> = {
  before: "drop-before",
  after: "drop-after",
  inside: "drop-inside",
} as const;

/**
 * Drop zone management for visual feedback during drag-drop.
 *
 * Tracks drop target and provides CSS classes for visual indicators.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * const dropZones = useDropZones({ debug: true });
 *
 * // Set drop target
 * dropZones.setDropTarget('node-123', 'inside');
 *
 * // Get drop indicator class
 * const className = dropZones.getIndicatorClass('node-123');
 *
 * // Clear drop target
 * dropZones.clearDropTarget();
 * ```
 */
export function useDropZones(options: { debug?: boolean } = {}) {
  const { debug = false } = options;

  /**
   * Current drop target node ID
   */
  const dropTargetId = ref<string | null>(null);

  /**
   * Current drop position relative to target
   */
  const dropPosition = ref<DropPosition>("inside");
  let targetRevision = 0;

  /**
   * Whether there is an active drop target
   */
  const hasDropTarget = computed<boolean>(() => dropTargetId.value !== null);

  /**
   * Current drop indicator CSS class
   */
  const dropIndicatorClass = computed<DropIndicatorClass>(() => {
    if (!dropTargetId.value) {
      return "";
    }
    return DROP_INDICATOR_CLASSES[dropPosition.value];
  });

  /**
   * Set the drop target and position.
   *
   * @param nodeId - Target node ID
   * @param position - Drop position relative to target
   */
  function setDropTarget(nodeId: string, position: DropPosition): void {
    if (
      dropTargetId.value === nodeId &&
      dropPosition.value === position
    ) {
      return;
    }

    targetRevision += 1;
    dropTargetId.value = nodeId;
    dropPosition.value = position;

    if (debug) {
      log("debug", "[useDropZones] Set drop target", {
        nodeId,
        position,
        indicatorClass: DROP_INDICATOR_CLASSES[position],
      });
    }
  }

  /**
   * Clear the current drop target.
   */
  function clearDropTarget(): void {
    targetRevision += 1;
    if (debug && dropTargetId.value) {
      log("debug", "[useDropZones] Cleared drop target", {
        nodeId: dropTargetId.value,
      });
    }

    dropTargetId.value = null;
    dropPosition.value = "inside";
  }

  function scheduleClearDropTarget(): void {
    const scheduledRevision = targetRevision;
    const scheduledTargetId = dropTargetId.value;

    queueMicrotask(() => {
      if (
        targetRevision !== scheduledRevision ||
        dropTargetId.value !== scheduledTargetId
      ) {
        return;
      }
      clearDropTarget();
    });
  }

  /**
   * Check if a specific node is the current drop target.
   *
   * @param nodeId - Node ID to check
   * @returns True if this node is the drop target
   */
  function isDropTarget(nodeId: string): boolean {
    return dropTargetId.value === nodeId;
  }

  /**
   * Get the drop indicator class for a specific node.
   *
   * @param nodeId - Node ID to get class for
   * @returns CSS class string or empty string
   */
  function getIndicatorClass(nodeId: string): DropIndicatorClass {
    return isDropTarget(nodeId) ? dropIndicatorClass.value : "";
  }

  /**
   * Get current drop target information.
   *
   * @returns Drop target info or null
   */
  function getDropTarget(): Readonly<
    Pick<DropTarget, "nodeId" | "position">
  > | null {
    if (!dropTargetId.value) {
      return null;
    }

    return {
      nodeId: dropTargetId.value,
      position: dropPosition.value,
    };
  }

  return {
    // State (readonly)
    dropTargetId: readonly(dropTargetId),
    dropPosition: readonly(dropPosition),
    hasDropTarget: readonly(hasDropTarget) as Readonly<ComputedRef<boolean>>,
    dropIndicatorClass: readonly(dropIndicatorClass) as Readonly<
      ComputedRef<DropIndicatorClass>
    >,

    setDropTarget,
    clearDropTarget,
    scheduleClearDropTarget,

    isDropTarget,
    getIndicatorClass,
    getDropTarget,
  };
}
