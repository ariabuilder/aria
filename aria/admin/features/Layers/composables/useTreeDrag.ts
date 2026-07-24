/**
 * Operations. Migrated from aria/admin/composables/useDragDrop.
 */

import { ref, readonly } from "vue";
import type { DragSource } from "../types";

interface DraggedComponentData {
  type: string;
  props?: Record<string, unknown>;
  /** Any additional metadata */
  [key: string]: unknown;
}

const isDragging = ref(false);

const draggedComponent = ref<DraggedComponentData | null>(null);

const dragSource = ref<DragSource>(null);

const wasSlotsManuallyClosed = ref(false);

/**
 * Global tree drag-drop state management.
 *
 * Simplified state management for HTML5 drag-drop operations.
 * Works with useFrameCoords, useCanvasDrop, and useCanvasEvents.
 *
 * @example
 * ```ts
 * const drag = useTreeDrag();
 *
 * // Start drag from block library
 * drag.startDrag('add-elements', {
 *   type: 'Button',
 *   props: { text: 'Click me' }
 * });
 *
 * // Check drag state
 * if (drag.isDragging.value) {
 *   console.log('Dragging:', drag.draggedComponent.value);
 * }
 *
 * // End drag
 * drag.endDrag();
 * ```
 */
export function useTreeDrag() {
  /**
   * Start a drag operation.
   *
   * @param source - Source of the drag ('add-elements', 'components', 'canvas', 'layers')
   * @param componentData - Data about the dragged component/block
   */
  function startDrag(
    source: DragSource,
    componentData: DraggedComponentData
  ): void {
    isDragging.value = true;
    dragSource.value = source;
    draggedComponent.value = componentData;
  }

  /**
   * End the current drag operation.
   */
  function endDrag(): void {
    isDragging.value = false;
    dragSource.value = null;
    draggedComponent.value = null;
  }

  /**
   * Clear drag state (alias for endDrag).
   */
  function clearDrag(): void {
    endDrag();
  }

  /**
   * Set whether slots panel was manually closed.
   *
   * @param closed - Whether slots were manually closed
   */
  function setSlotsManuallyClosed(closed: boolean): void {
    wasSlotsManuallyClosed.value = closed;
  }

  /**
   * Reset all drag state.
   */
  function resetDragState(): void {
    isDragging.value = false;
    dragSource.value = null;
    draggedComponent.value = null;
    wasSlotsManuallyClosed.value = false;
  }

  return {
    // State (readonly)
    isDragging: readonly(isDragging) as Readonly<typeof isDragging>,
    draggedComponent: readonly(draggedComponent) as Readonly<
      typeof draggedComponent
    >,
    dragSource: readonly(dragSource) as Readonly<typeof dragSource>,
    wasSlotsManuallyClosed: readonly(wasSlotsManuallyClosed) as Readonly<
      typeof wasSlotsManuallyClosed
    >,

    startDrag: readonly(startDrag),
    endDrag: readonly(endDrag),
    clearDrag: readonly(clearDrag),
    setSlotsManuallyClosed: readonly(setSlotsManuallyClosed),
    resetDragState: readonly(resetDragState),
  };
}
