import type { CanvasDragSource } from "@/composables/useDragDrop";

const TOOLBAR_SUPPRESSING_DRAG_SOURCES = new Set<CanvasDragSource>([
  "add-elements",
  "components",
]);

export function shouldHideSelectionToolbar(
  isDragging: boolean,
  dragSource: CanvasDragSource,
): boolean {
  return isDragging && TOOLBAR_SUPPRESSING_DRAG_SOURCES.has(dragSource);
}
