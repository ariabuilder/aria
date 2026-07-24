import { onBeforeUnmount, watch, type Ref } from "vue";

import { refreshCanvasOverlayPositions } from "../../../composables/canvasOverlayRefresh";
import {
  CANVAS_ZOOM_TRANSITION_MS,
  prefersReducedCanvasMotion,
} from "./canvasZoomMotion";

export function useCanvasZoomTransition(
  containerRef: Ref<HTMLElement | null>,
  scale: () => number,
  animateEnabled: () => boolean,
): void {
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let overlayRefreshFrame: number | null = null;

  const clearOverlayRefresh = (): void => {
    if (overlayRefreshFrame !== null) {
      cancelAnimationFrame(overlayRefreshFrame);
      overlayRefreshFrame = null;
    }
  };

  const stopTransitionTracking = (): void => {
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }

    clearOverlayRefresh();
    containerRef.value?.classList.remove("is-canvas-zooming");
  };

  const refreshOverlaysDuringTransition = (): void => {
    refreshCanvasOverlayPositions();
    overlayRefreshFrame = requestAnimationFrame(refreshOverlaysDuringTransition);
  };

  const beginTransition = (): void => {
    const container = containerRef.value;
    if (!container || !animateEnabled() || prefersReducedCanvasMotion()) {
      refreshCanvasOverlayPositions();
      return;
    }

    container.classList.add("is-canvas-zooming");

    if (overlayRefreshFrame === null) {
      refreshOverlaysDuringTransition();
    }

    if (settleTimer) {
      clearTimeout(settleTimer);
    }

    settleTimer = setTimeout(() => {
      stopTransitionTracking();
      refreshCanvasOverlayPositions();
    }, CANVAS_ZOOM_TRANSITION_MS + 40);
  };

  watch(scale, (next, previous) => {
    if (previous === undefined || next === previous) {
      return;
    }

    beginTransition();
  });

  onBeforeUnmount(() => {
    stopTransitionTracking();
  });
}
