import { onBeforeUnmount, onMounted, watch, type Ref } from "vue";

export interface HorizontalWheelCaptureInput {
  deltaX: number;
  deltaY: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export interface UseCanvasHorizontalScrollOptions {
  iframeRef?: Ref<HTMLIFrameElement | null | undefined>;
}

export function wheelEventToHorizontalInput(
  event: WheelEvent,
): HorizontalWheelCaptureInput {
  return {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  };
}

export function resolveHorizontalWheelDelta(
  input: HorizontalWheelCaptureInput,
): number {
  if (
    input.shiftKey &&
    Math.abs(input.deltaY) > Math.abs(input.deltaX)
  ) {
    return input.deltaY;
  }

  return input.deltaX;
}

export function hasHorizontalScrollOverflow(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth;
}

export function isHorizontalDominantWheel(input: HorizontalWheelCaptureInput): boolean {
  if (
    input.shiftKey &&
    Math.abs(input.deltaY) > Math.abs(input.deltaX)
  ) {
    return true;
  }

  return Math.abs(input.deltaX) > Math.abs(input.deltaY);
}

export function shouldCaptureHorizontalWheel(
  element: HTMLElement,
  input: HorizontalWheelCaptureInput,
): boolean {
  if (input.ctrlKey || input.metaKey) {
    return false;
  }

  if (!isHorizontalDominantWheel(input)) {
    return false;
  }

  return hasHorizontalScrollOverflow(element);
}

export function applyHorizontalWheelScroll(
  element: HTMLElement,
  input: HorizontalWheelCaptureInput,
): boolean {
  if (!shouldCaptureHorizontalWheel(element, input)) {
    return false;
  }

  element.scrollLeft += resolveHorizontalWheelDelta(input);
  return true;
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

export function useCanvasHorizontalScroll(
  containerRef: Ref<HTMLElement | null>,
  options: UseCanvasHorizontalScrollOptions = {},
): void {
  const iframeRef = options.iframeRef;
  let container: HTMLElement | null = null;
  let detachIframeWheel: (() => void) | null = null;

  const onWheel = (event: WheelEvent): void => {
    if (!container) {
      return;
    }

    const captured = applyHorizontalWheelScroll(
      container,
      wheelEventToHorizontalInput(event),
    );

    if (captured) {
      event.preventDefault();
    }
  };

  const attachContainer = (element: HTMLElement | null): void => {
    if (container) {
      container.removeEventListener("wheel", onWheel);
      container = null;
    }

    if (!element) {
      return;
    }

    container = element;
    container.addEventListener("wheel", onWheel, { passive: false });
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
