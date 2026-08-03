/**
 * Frame-aware HTML5 drag-and-drop for add-elements library drags. Visual
 * feedback is emitted via `canvas:add-elements-insertion` for overlay rendering.
 */

import { ref, computed, type Ref, type ComputedRef } from "vue";
import {
  AddElementsInsertionDetailSchema,
  CanvasDropDetailSchema,
  LibraryDragPayloadSchema,
  type LibraryDragPayload,
} from "../../Nodes/events/shared/nodeEventSchemas";
import { STAGE_CONTENT_ROOT_ATTR } from "../composables/useIframeSetup";
import { useFrameCoords } from "../composables/useFrameCoords";
import {
  createFrameViewportPoint,
  createFrameViewportRect,
  resolveLibraryDropIntent,
  type FrameViewportRect,
} from "../interaction";
import {
  normalizeIframeDragPoint,
  normalizeParentDragPoint,
  type NormalizedDragPoint,
} from "./canvasDragCoordinates";

interface DropZone {
  readonly element: HTMLElement;
  readonly id: string;
  readonly name: string;
  readonly isRoot?: boolean;
  insertionIndex?: number;
}

interface DragState {
  isDragging: boolean;
  dropDispatched: boolean;
  currentDropZone: DropZone | null;
  draggedData: LibraryDragPayload | null;
  currentChildIndex: number;
  lastFrameX: number;
  lastFrameY: number;
  lastWorldX: number;
  lastWorldY: number;
}

interface UseCanvasDropReturn {
  readonly state: Ref<DragState>;
  readonly isDragging: ComputedRef<boolean>;
  readonly currentDropZone: ComputedRef<DropZone | null>;
  readonly currentInsertionIndex: ComputedRef<number>;
  readonly startDrag: (data: LibraryDragPayload) => void;
  readonly endDrag: () => void;
  readonly init: () => void;
  readonly destroy: () => void;
}

const ROOT_DROP_ZONE_ID = "__aria-root__" as const;
const AUTO_SCROLL_EDGE_PX = 56;
const AUTO_SCROLL_MAX_STEP_PX = 22;

function createInitialDragState(): DragState {
  return {
    isDragging: false,
    dropDispatched: false,
    currentDropZone: null,
    draggedData: null,
    currentChildIndex: 0,
    lastFrameX: 0,
    lastFrameY: 0,
    lastWorldX: 0,
    lastWorldY: 0,
  };
}

function resolveStageContentRoot(body: HTMLElement): HTMLElement {
  return (
    body.querySelector<HTMLElement>(`[${STAGE_CONTENT_ROOT_ATTR}]`) ?? body
  );
}

function dispatchDropEvent(detail: {
  zone: DropZone;
  data: LibraryDragPayload;
  x: number;
  y: number;
  insertionIndex: number;
}): void {
  const payload = CanvasDropDetailSchema.safeParse({
    zone: { id: detail.zone.id, name: detail.zone.name },
    data: detail.data,
    insertionIndex: detail.insertionIndex,
    x: detail.x,
    y: detail.y,
  });

  if (!payload.success) {
    if (import.meta.env.DEV) {
      console.warn(
        "[useCanvasDrop] Invalid canvas:drop payload",
        payload.error,
      );
    }
    return;
  }

  window.dispatchEvent(
    new CustomEvent("canvas:drop", {
      detail: payload.data,
      bubbles: true,
      cancelable: false,
    }),
  );
}

function dispatchAddElementsInsertion(
  detail: Parameters<typeof AddElementsInsertionDetailSchema.safeParse>[0],
): void {
  const payload = AddElementsInsertionDetailSchema.safeParse(detail);

  if (!payload.success) {
    if (import.meta.env.DEV) {
      console.warn(
        "[useCanvasDrop] Invalid canvas:add-elements-insertion",
        payload.error,
      );
    }
    return;
  }

  window.dispatchEvent(
    new CustomEvent("canvas:add-elements-insertion", {
      detail: payload.data,
      bubbles: true,
      cancelable: false,
    }),
  );
}

function hideAddElementsInsertion(): void {
  dispatchAddElementsInsertion({
    visible: false,
    dropParentId: ROOT_DROP_ZONE_ID,
    insertionIndex: 0,
    gapViewport: { left: 0, top: 0, width: 0, height: 0 },
  });
}

function toLegacyViewportRect(rect: FrameViewportRect): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function useCanvasDrop(
  iframeElement: Ref<HTMLIFrameElement | null>,
): UseCanvasDropReturn {
  const state = ref(createInitialDragState() as unknown) as Ref<DragState>;

  const { getComputedScale } = useFrameCoords(iframeElement);

  const isDragging = computed(() => state.value.isDragging);
  const currentDropZone = computed(() => state.value.currentDropZone);
  const currentInsertionIndex = computed(() => state.value.currentChildIndex);

  let scrollCleanup: (() => void) | null = null;
  let feedbackFrame: number | null = null;
  let autoScrollFrame: number | null = null;
  let pendingFeedbackPoint: NormalizedDragPoint | null = null;

  function attachScrollListener(): void {
    detachScrollListener();
    const iframeWindow = iframeElement.value?.contentWindow;
    if (!iframeWindow) return;

    const onScroll = () => {
      if (!state.value.isDragging) return;
      scheduleDropFeedback({
        frameX: state.value.lastFrameX,
        frameY: state.value.lastFrameY,
        worldX: state.value.lastWorldX,
        worldY: state.value.lastWorldY,
      });
    };

    iframeWindow.addEventListener("scroll", onScroll, { passive: true });
    scrollCleanup = () => {
      iframeWindow.removeEventListener("scroll", onScroll);
    };
  }

  function detachScrollListener(): void {
    scrollCleanup?.();
    scrollCleanup = null;
  }

  function resolveDragPoint(event: DragEvent): NormalizedDragPoint | null {
    const iframe = iframeElement.value;
    const iframeWindow = iframe?.contentWindow ?? null;
    const iframeDoc = iframe?.contentDocument ?? null;

    if (!iframe || !iframeWindow || !iframeDoc) {
      return null;
    }

    const currentTarget = event.currentTarget;
    const targetDocument =
      event.target &&
      typeof event.target === "object" &&
      "ownerDocument" in event.target
        ? (event.target as { ownerDocument?: Document | null }).ownerDocument
        : null;
    const isIframeEvent =
      event.view === iframeWindow ||
      currentTarget === iframeWindow ||
      currentTarget === iframeDoc ||
      targetDocument === iframeDoc;

    const frameRect = iframe.getBoundingClientRect();
    const scale = getComputedScale(iframe) || 1;
    const frameWidth = iframeWindow.innerWidth || iframe.clientWidth;
    const frameHeight = iframeWindow.innerHeight || iframe.clientHeight;

    if (isIframeEvent) {
      return normalizeIframeDragPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        frameRect,
        frameWidth,
        frameHeight,
        scale,
      });
    }

    return normalizeParentDragPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      frameRect,
      scale,
    });
  }

  function clearDropFeedback(): void {
    state.value.currentDropZone = null;
    state.value.currentChildIndex = 0;
    hideAddElementsInsertion();
  }

  function updateDropFeedback(point: NormalizedDragPoint): void {
    if (!state.value.isDragging) return;

    const iframeDoc = iframeElement.value?.contentDocument ?? null;
    const body = iframeDoc?.body ?? null;

    if (!body) {
      if (state.value.currentDropZone) {
        state.value.currentDropZone = null;
        hideAddElementsInsertion();
      }
      return;
    }

    const contentRoot = resolveStageContentRoot(body);
    if (!iframeDoc) {
      return;
    }

    const resolution = resolveLibraryDropIntent({
      doc: iframeDoc,
      point: createFrameViewportPoint(point.frameX, point.frameY),
      contentRoot,
      body,
    });
    const { dropParent, dropParentId, intent } = resolution;
    const insertionOverlay = resolution.overlays.find(
      (entry) => entry.kind === "insertion",
    );

    const zoneData: DropZone = {
      element: dropParent,
      id: dropParentId,
      name: dropElementZoneName(dropParent, intent.parentId === null),
      isRoot: intent.parentId === null,
    };

    state.value.currentDropZone = zoneData;
    state.value.currentChildIndex = intent.index;

    dispatchAddElementsInsertion({
      visible: true,
      dropParentId,
      insertionIndex: intent.index,
      gapViewport: intent.visualRects?.insertion
        ? toLegacyViewportRect(
            createFrameViewportRect(intent.visualRects.insertion),
          )
        : { left: 0, top: 0, width: 0, height: 0 },
      targetViewport: intent.visualRects?.target
        ? toLegacyViewportRect(
            createFrameViewportRect(intent.visualRects.target),
          )
        : undefined,
      orientation:
        insertionOverlay?.kind === "insertion"
          ? insertionOverlay.orientation
          : "horizontal",
    });
  }

  function cancelFeedbackFrame(): void {
    if (feedbackFrame !== null) {
      window.cancelAnimationFrame(feedbackFrame);
      feedbackFrame = null;
    }
    pendingFeedbackPoint = null;
  }

  function scheduleDropFeedback(point: NormalizedDragPoint): void {
    pendingFeedbackPoint = point;
    if (feedbackFrame !== null) return;

    feedbackFrame = window.requestAnimationFrame(() => {
      feedbackFrame = null;
      const latest = pendingFeedbackPoint;
      pendingFeedbackPoint = null;
      if (latest) updateDropFeedback(latest);
    });
  }

  function autoScrollVelocity(position: number, extent: number): number {
    if (position < AUTO_SCROLL_EDGE_PX) {
      return -Math.ceil(
        AUTO_SCROLL_MAX_STEP_PX *
          (1 - Math.max(position, 0) / AUTO_SCROLL_EDGE_PX),
      );
    }
    if (position > extent - AUTO_SCROLL_EDGE_PX) {
      return Math.ceil(
        AUTO_SCROLL_MAX_STEP_PX *
          (1 - Math.max(extent - position, 0) / AUTO_SCROLL_EDGE_PX),
      );
    }
    return 0;
  }

  function stopAutoScroll(): void {
    if (autoScrollFrame !== null) {
      window.cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }
  }

  function updateAutoScroll(point: NormalizedDragPoint): void {
    stopAutoScroll();
    const iframeWindow = iframeElement.value?.contentWindow;
    if (!iframeWindow) return;

    const step = () => {
      if (!state.value.isDragging) {
        autoScrollFrame = null;
        return;
      }
      const x = autoScrollVelocity(point.frameX, iframeWindow.innerWidth);
      const y = autoScrollVelocity(point.frameY, iframeWindow.innerHeight);
      if (x === 0 && y === 0) {
        autoScrollFrame = null;
        return;
      }
      iframeWindow.scrollBy(x, y);
      scheduleDropFeedback(point);
      autoScrollFrame = window.requestAnimationFrame(step);
    };

    autoScrollFrame = window.requestAnimationFrame(step);
  }

  function resolveCurrentDrop(point: NormalizedDragPoint): DropZone | null {
    const iframeDoc = iframeElement.value?.contentDocument ?? null;
    const body = iframeDoc?.body ?? null;

    if (!body) {
      return null;
    }

    const contentRoot = resolveStageContentRoot(body);
    if (!iframeDoc) {
      return null;
    }

    const resolution = resolveLibraryDropIntent({
      doc: iframeDoc,
      point: createFrameViewportPoint(point.frameX, point.frameY),
      contentRoot,
      body,
    });
    const { dropParent, dropParentId, intent } = resolution;

    state.value.currentChildIndex = intent.index;
    return {
      element: dropParent,
      id: dropParentId,
      name: dropElementZoneName(dropParent, intent.parentId === null),
      isRoot: intent.parentId === null,
    };
  }

  function dropElementZoneName(
    dropParent: HTMLElement,
    isRoot: boolean,
  ): string {
    if (isRoot) return "root";
    return dropParent.getAttribute("data-zone-name") || "default";
  }

  function handleDragOver(event: DragEvent): void {
    if (!state.value.isDragging) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }

    const point = resolveDragPoint(event);
    if (!point) {
      clearDropFeedback();
      return;
    }

    state.value.lastFrameX = point.frameX;
    state.value.lastFrameY = point.frameY;
    state.value.lastWorldX = point.worldX;
    state.value.lastWorldY = point.worldY;
    scheduleDropFeedback(point);
    updateAutoScroll(point);
  }

  function handleDrop(event: DragEvent): void {
    if (!state.value.isDragging || !state.value.draggedData) {
      return;
    }

    event.preventDefault();

    cancelFeedbackFrame();
    stopAutoScroll();
    const point = resolveDragPoint(event);
    const resolvedDropZone = point
      ? resolveCurrentDrop(point)
      : state.value.currentDropZone;

    if (resolvedDropZone) {
      dispatchDropEvent({
        zone: resolvedDropZone,
        data: state.value.draggedData,
        x: point?.worldX ?? state.value.lastWorldX ?? event.clientX,
        y: point?.worldY ?? state.value.lastWorldY ?? event.clientY,
        insertionIndex: state.value.currentChildIndex,
      });
      state.value.dropDispatched = true;
    }

    endDrag();
  }

  function handleDragEnd(): void {
    endDrag();
  }

  function handleCanvasExit(event: DragEvent): void {
    if (!state.value.isDragging) return;
    if (event.relatedTarget) return;
    const eventDocument =
      event.target &&
      typeof event.target === "object" &&
      "ownerDocument" in event.target
        ? (event.target as { ownerDocument?: Document | null }).ownerDocument
        : null;
    const eventWindow = eventDocument?.defaultView ?? window;
    const outsideViewport =
      event.clientX <= 0 ||
      event.clientY <= 0 ||
      event.clientX >= eventWindow.innerWidth ||
      event.clientY >= eventWindow.innerHeight;
    if (outsideViewport) endDrag();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && state.value.isDragging) {
      endDrag();
    }
  }

  function startDrag(data: LibraryDragPayload): void {
    const parsed = LibraryDragPayloadSchema.safeParse(data);
    if (!parsed.success) {
      if (import.meta.env.DEV) {
        console.warn("[useCanvasDrop] Invalid drag payload", parsed.error);
      }
      return;
    }

    state.value.isDragging = true;
    state.value.dropDispatched = false;
    state.value.draggedData = parsed.data;
    state.value.currentChildIndex = 0;
    state.value.lastFrameX = 0;
    state.value.lastFrameY = 0;
    state.value.lastWorldX = 0;
    state.value.lastWorldY = 0;

    window.dispatchEvent(
      new CustomEvent("canvas:add-elements-drag-start", { bubbles: true }),
    );

    window.addEventListener("dragover", handleDragOver, true);
    window.addEventListener("drop", handleDrop, true);
    window.addEventListener("dragend", handleDragEnd, true);
    window.addEventListener("dragleave", handleCanvasExit, true);
    window.addEventListener("keydown", handleKeyDown, true);

    const iframeDoc = iframeElement.value?.contentDocument;
    const iframeWindow = iframeElement.value?.contentWindow;
    iframeDoc?.addEventListener("dragover", handleDragOver, true);
    iframeDoc?.addEventListener("drop", handleDrop, true);
    iframeWindow?.addEventListener("dragover", handleDragOver, true);
    iframeWindow?.addEventListener("drop", handleDrop, true);

    attachScrollListener();
  }

  function endDrag(): void {
    cancelFeedbackFrame();
    stopAutoScroll();
    hideAddElementsInsertion();
    detachScrollListener();

    state.value.isDragging = false;
    state.value.dropDispatched = false;
    state.value.currentDropZone = null;
    state.value.draggedData = null;
    state.value.currentChildIndex = 0;

    window.removeEventListener("dragover", handleDragOver, true);
    window.removeEventListener("drop", handleDrop, true);
    window.removeEventListener("dragend", handleDragEnd, true);
    window.removeEventListener("dragleave", handleCanvasExit, true);
    window.removeEventListener("keydown", handleKeyDown, true);

    const iframeDoc = iframeElement.value?.contentDocument;
    const iframeWindow = iframeElement.value?.contentWindow;
    iframeDoc?.removeEventListener("dragover", handleDragOver, true);
    iframeDoc?.removeEventListener("drop", handleDrop, true);
    iframeWindow?.removeEventListener("dragover", handleDragOver, true);
    iframeWindow?.removeEventListener("drop", handleDrop, true);

    window.dispatchEvent(
      new CustomEvent("canvas:add-elements-drag-end", { bubbles: true }),
    );
  }

  function init(): void {
    if (import.meta.env.DEV) {
      console.debug("[useCanvasDrop] Initialized");
    }
  }

  function destroy(): void {
    endDrag();
  }

  return {
    state,
    isDragging,
    currentDropZone,
    currentInsertionIndex,
    startDrag,
    endDrag,
    init,
    destroy,
  };
}
