import { onBeforeUnmount, onMounted, watch, type Ref } from "vue";

import { useZoom } from "./useZoom";
import {
  computeAnchoredScrollLeft,
  computeWheelZoomDelta,
} from "./canvasZoomMotion";

export interface UseCanvasWheelZoomOptions {
  enabled?: () => boolean;
  iframeRef?: Ref<HTMLIFrameElement | null | undefined>;
}

export function anchorCanvasScrollToCursor(
  container: HTMLElement,
  clientX: number,
): void {
  const rect = container.getBoundingClientRect();
  const cursorX = clientX - rect.left;
  const previousScrollWidth = container.scrollWidth;
  const previousScrollLeft = container.scrollLeft;

  requestAnimationFrame(() => {
    const nextScrollWidth = container.scrollWidth;
    if (previousScrollWidth <= 0 || nextScrollWidth <= 0) {
      return;
    }

    container.scrollLeft = Math.max(
      0,
      computeAnchoredScrollLeft(
        previousScrollLeft,
        previousScrollWidth,
        cursorX,
        nextScrollWidth,
      ),
    );
  });
}

export function shouldCaptureWheelZoom(event: WheelEvent): boolean {
  if (!event.ctrlKey && !event.metaKey) {
    return false;
  }

  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    return false;
  }

  return computeWheelZoomDelta(event.deltaY) !== 0;
}

function attachIframeDocumentWheel(
  iframe: HTMLIFrameElement,
  onWheel: (event: WheelEvent) => void,
): () => void {
  let detachDocumentWheel: (() => void) | null = null;

  const attachDocumentWheel = (): void => {
    detachDocumentWheel?.();
    detachDocumentWheel = null;

    const contentDocument = iframe.contentDocument;
    if (!contentDocument) {
      return;
    }

    contentDocument.addEventListener("wheel", onWheel, { passive: false });
    detachDocumentWheel = () => {
      contentDocument.removeEventListener("wheel", onWheel);
    };
  };

  const onIframeLoad = (): void => {
    attachDocumentWheel();
  };

  iframe.addEventListener("load", onIframeLoad);
  attachDocumentWheel();

  return () => {
    iframe.removeEventListener("load", onIframeLoad);
    detachDocumentWheel?.();
  };
}

export function useCanvasWheelZoom(
  containerRef: Ref<HTMLElement | null>,
  options: UseCanvasWheelZoomOptions = {},
): void {
  const { setZoomAnimated, setScaleMode } = useZoom();
  const enabled = options.enabled ?? (() => true);
  const iframeRef = options.iframeRef;

  let container: HTMLElement | null = null;
  let detachIframeWheel: (() => void) | null = null;

  const onWheel = (event: WheelEvent): void => {
    if (!container || !enabled()) {
      return;
    }

    if (!shouldCaptureWheelZoom(event)) {
      return;
    }

    event.preventDefault();

    const delta = computeWheelZoomDelta(event.deltaY);
    setScaleMode("natural", { resetZoom: false });
    setZoomAnimated(undefined, { delta });
    anchorCanvasScrollToCursor(container, event.clientX);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!enabled()) {
      return;
    }

    const hasMod = event.metaKey || event.ctrlKey;
    if (!hasMod) {
      return;
    }

    if (event.key === "0") {
      event.preventDefault();
      setScaleMode("fit");
      return;
    }

    if (event.key === "1") {
      event.preventDefault();
      setScaleMode("natural", { resetZoom: false });
      setZoomAnimated(100);
    }
  };

  const attachContainer = (element: HTMLElement | null): void => {
    if (container) {
      container.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      container = null;
    }

    if (!element) {
      return;
    }

    container = element;
    container.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
  };

  const attachIframe = (iframe: HTMLIFrameElement | null | undefined): void => {
    detachIframeWheel?.();
    detachIframeWheel = null;

    if (!iframe) {
      return;
    }

    detachIframeWheel = attachIframeDocumentWheel(iframe, onWheel);
  };

  onMounted(() => {
    attachContainer(containerRef.value);
    attachIframe(iframeRef?.value);
  });

  watch(containerRef, (next) => {
    attachContainer(next);
  });

  if (iframeRef) {
    watch(iframeRef, (next) => {
      attachIframe(next);
    });
  }

  onBeforeUnmount(() => {
    attachContainer(null);
    detachIframeWheel?.();
  });
}
