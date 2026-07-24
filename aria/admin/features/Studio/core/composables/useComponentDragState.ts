import { useStudioOrganizerDragState } from "./useStudioOrganizerDragState";

export function useComponentDragState() {
  const dragState = useStudioOrganizerDragState();

  return {
    draggedComponentId: dragState.draggedItemId,
    dragTargetGroupId: dragState.dragTargetGroupId,
    startDrag: dragState.startDrag,
    endDrag: dragState.endDrag,
    setDropTarget: dragState.setDropTarget,
    clearDropTarget: dragState.clearDropTarget,
  };
}
