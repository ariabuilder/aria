/**
 * Sets up hover, click, and toolbar listeners for the Stage iframe.
 */

import { watch, type Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { useCanvasInteractionBridge } from "../../Core";
import type { NodeLocationInfo, StageSelectBlockInput } from "../types";
import type { UseComponentConversionReturn } from "./useComponentConversion";
import type { OverlayUpdateMode } from "../../../composables/useCanvasOverlays";
import {
  createFrameViewportPoint,
  resolveEventTargetElement,
  resolveHoverAtPoint,
  resolveHoverFromEventTarget,
  resolveSelectionAtPoint,
  resolveSelectionFromEventTarget,
} from "../interaction";

export interface UseOverlayListenersOptions {
  iframeRef: Ref<HTMLIFrameElement | null>;
  getDoc: () => Document | null;
  isDragging: Ref<boolean>;
  canvasOverlays: {
    showHover: (element: Element, nodeId: string) => void;
    hideHover: () => void;
    showSelection: (
      element: Element,
      nodeId: string,
      nodeType?: string,
    ) => void;
    schedulePositionUpdate: (mode?: OverlayUpdateMode) => void;
    hideSelection: () => void;
  };
  syncSelectionToolbar: (nodeId: string) => void;
  emit: {
    (e: "selectBlock", selection: StageSelectBlockInput): void;
    (e: "detachComponent", id: string): void;
    (e: "editComponent", id: string): void;
    (e: "duplicateBlock", id: string): void;
    (e: "deleteBlock", id: string): void;
  };
  findNodeLocation: (
    blocks: BuilderNode[],
    id: string,
  ) => NodeLocationInfo | null;
  findNode: (blocks: BuilderNode[], id: string) => BuilderNode | null;
  getBlocks: () => BuilderNode[];
  conversion: UseComponentConversionReturn;
  isTextContent: (el: Element) => boolean;
  semanticPriority: Record<string, number>;
}

export function useOverlayListeners(options: UseOverlayListenersOptions) {
  const {
    iframeRef,
    getDoc,
    isDragging,
    canvasOverlays,
    syncSelectionToolbar,
    emit,
    isTextContent,
    semanticPriority,
  } = options;
  const {
    broadcastSelectNode,
    signalClearInsertionContext,
  } = useCanvasInteractionBridge();

  const isEditableTarget = (target: EventTarget | null): boolean => {
    const element = resolveEventTargetElement(target);
    if (!element) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    return (
      element instanceof HTMLElement &&
      (element.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select")
    );
  };

  const readClipboardEventData = (
    event: ClipboardEvent,
  ): {
    clipboardText?: string;
    clipboardHtml?: string;
  } => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return {};
    }

    const clipboardText = clipboardData.getData("text/plain") || undefined;
    const clipboardHtml = clipboardData.getData("text/html") || undefined;

    return {
      clipboardText,
      clipboardHtml,
    };
  };

  const setupOverlayListeners = (): void => {
    const iframeDoc = getDoc();
    if (!iframeDoc) return;

    let currentHoveredElement: Element | null = null;
    let currentSelectedNodeId: string | null = null;

    iframeDoc.addEventListener(
      "mousemove",
      (e: MouseEvent) => {
        if (isDragging.value) {
          if (currentHoveredElement) {
            canvasOverlays.hideHover();
            currentHoveredElement = null;
          }
          return;
        }

        const hoverTarget =
          resolveHoverAtPoint(
            iframeDoc,
            createFrameViewportPoint(e.clientX, e.clientY),
          ) ?? resolveHoverFromEventTarget(e.target);
        const blockElement = hoverTarget?.element ?? null;

        if (hoverTarget && blockElement && blockElement !== currentHoveredElement) {
          currentHoveredElement = blockElement;
          canvasOverlays.showHover(blockElement, hoverTarget.nodeId);
        } else if (!hoverTarget && currentHoveredElement) {
          currentHoveredElement = null;
          canvasOverlays.hideHover();
        }
      },
      false,
    );

    const iframe = iframeRef.value;
    if (iframe) {
      iframe.addEventListener("mouseleave", () => {
        if (currentHoveredElement) {
          canvasOverlays.hideHover();
          currentHoveredElement = null;
        }
      });
    }

    iframeDoc.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          console.log(
            "[StageFrame] Escape pressed - deselecting and clearing insertion context",
          );
          currentSelectedNodeId = null;
          emit("selectBlock", null);
          broadcastSelectNode({ nodeId: null });
          signalClearInsertionContext();
          canvasOverlays.hideHover();
          canvasOverlays.hideSelection();
          e.preventDefault();
        }
      },
      true,
    );

    iframeDoc.addEventListener(
      "paste",
      (event: ClipboardEvent) => {
        if (isEditableTarget(event.target)) {
          return;
        }

        window.dispatchEvent(
          new CustomEvent("component:paste", {
            detail: {
              nodeId: currentSelectedNodeId,
              ...readClipboardEventData(event),
            },
          }),
        );
        event.preventDefault();
      },
      true,
    );

    iframeDoc.addEventListener(
      "click",
      (e: MouseEvent) => {
        const target = resolveEventTargetElement(e.target);
        if (!target) {
          return;
        }

        if (target.closest("a[href]")) {
          e.preventDefault();
        }

        const selectionOptions = {
          isTextContent,
          semanticPriority,
        };
        const selection =
          resolveSelectionAtPoint(
            iframeDoc,
            createFrameViewportPoint(e.clientX, e.clientY),
            selectionOptions,
          ) ?? resolveSelectionFromEventTarget(e.target, selectionOptions);

        if (!selection) {
          currentSelectedNodeId = null;
          emit("selectBlock", null);
          broadcastSelectNode({ nodeId: null });
          canvasOverlays.hideHover();
          canvasOverlays.hideSelection();
          return;
        }

        const blockElement = selection.element;
        e.stopPropagation();

        canvasOverlays.hideHover();

        currentSelectedNodeId = selection.nodeId;
        canvasOverlays.showSelection(
          blockElement,
          selection.nodeId,
          selection.nodeType,
        );
        syncSelectionToolbar(selection.nodeId);
        emit("selectBlock", {
          nodeId: selection.nodeId,
          triggerGesture: {
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
          },
        });
      },
      true,
    );

    // Hide overlay when dragging starts
    watch(isDragging, (dragging) => {
      if (dragging) {
        canvasOverlays.hideHover();
        currentHoveredElement = null;
      }
    });
  };

  return {
    setupOverlayListeners,
  };
}
