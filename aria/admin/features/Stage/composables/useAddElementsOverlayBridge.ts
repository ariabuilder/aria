import { onMounted, onUnmounted } from "vue";
import {
  AddElementsInsertionDetailSchema,
  type AddElementsInsertionDetail,
} from "../../Nodes/events/shared/nodeEventSchemas";
import type { OverlayPosition } from "../../../composables/useCanvasOverlays";

interface AddElementsOverlayBridge {
  showAddElementsDropFeedback: (
    placeholder: OverlayPosition,
    target?: OverlayPosition | null,
    orientation?: "horizontal" | "vertical",
  ) => void;
  hideAddElementsDropFeedback: () => void;
  hideInsertion: () => void;
  hideHover: () => void;
}

function toOverlayPosition(rect: AddElementsInsertionDetail["gapViewport"]): OverlayPosition {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function useAddElementsOverlayBridge(
  canvasOverlays: AddElementsOverlayBridge,
): void {
  const handleInsertion = (event: Event): void => {
    const raw = (event as CustomEvent).detail;
    const parsed = AddElementsInsertionDetailSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }

    const detail = parsed.data;
    if (!detail.visible) {
      canvasOverlays.hideAddElementsDropFeedback();
      return;
    }

    const placeholder = toOverlayPosition(detail.gapViewport);
    const target = detail.targetViewport
      ? toOverlayPosition(detail.targetViewport)
      : null;

    canvasOverlays.showAddElementsDropFeedback(
      placeholder,
      target,
      detail.orientation ?? "vertical",
    );
  };

  const handleDragStart = (): void => {
    canvasOverlays.hideInsertion();
    canvasOverlays.hideHover();
  };

  const handleDragEnd = (): void => {
    canvasOverlays.hideAddElementsDropFeedback();
  };

  onMounted(() => {
    window.addEventListener("canvas:add-elements-insertion", handleInsertion);
    window.addEventListener("canvas:add-elements-drag-start", handleDragStart);
    window.addEventListener("canvas:add-elements-drag-end", handleDragEnd);
  });

  onUnmounted(() => {
    window.removeEventListener("canvas:add-elements-insertion", handleInsertion);
    window.removeEventListener("canvas:add-elements-drag-start", handleDragStart);
    window.removeEventListener("canvas:add-elements-drag-end", handleDragEnd);
    canvasOverlays.hideAddElementsDropFeedback();
  });
}
