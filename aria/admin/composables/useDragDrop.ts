import { ref, readonly } from "vue";

/**
 * Global drag-and-drop state management
 * Simplified for use with native HTML5 events (no external libraries)
 * Works with useFrameCoords, useCanvasDrop, and useCanvasEvents composables
 */

const isDragging = ref(false);
const draggedComponent = ref<unknown>(null);
const dragSource = ref<"add-elements" | "components" | "canvas" | null>(null);
const wasSlotsManuallyClosed = ref(false);

/**
 * Create a reactive reference to the drag state
 */
export function useDragDrop() {
  const startDrag = (
    source: typeof dragSource.value,
    componentData: unknown,
  ) => {
    isDragging.value = true;
    dragSource.value = source;
    draggedComponent.value = componentData;
  };

  const endDrag = () => {
    isDragging.value = false;
    dragSource.value = null;
    draggedComponent.value = null;
  };

  const clearDrag = () => {
    endDrag();
  };

  const setSlotsManuallyClosed = (closed: boolean) => {
    wasSlotsManuallyClosed.value = closed;
  };

  return {
    // State (readonly)
    isDragging: readonly(isDragging),
    draggedComponent: readonly(draggedComponent),
    dragSource: readonly(dragSource),
    wasSlotsManuallyClosed: readonly(wasSlotsManuallyClosed),

    startDrag,
    endDrag,
    clearDrag,
    setSlotsManuallyClosed,
  };
}
