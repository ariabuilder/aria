import { onMounted, onUnmounted, type Ref } from "vue";

import { IFRAME_Z_INDEX } from "@/lib/zIndex";
import { useCanvasSignalBridge } from "../../Core";
import { getStageDragInlineStyles } from "../styles/stageDropFeedback";
import type { StageSelectBlockInput } from "../types";

interface UseStageGlobalCanvasEventsOptions {
  iframeRef: Ref<HTMLIFrameElement | null>;
  insertionIndicatorEl: Ref<HTMLDivElement | null>;
  emit: {
    (e: "selectBlock", selection: StageSelectBlockInput): void;
    (e: "deleteBlock", id: string): void;
  };
}

export function useStageGlobalCanvasEvents(
  options: UseStageGlobalCanvasEventsOptions,
) {
  const { broadcastComponentWrapperResponse } = useCanvasSignalBridge();

  const handleInsertionIndicator = (event: Event): void => {
    const detail = (event as CustomEvent).detail;
    const iframe = options.iframeRef.value;
    if (!iframe?.contentDocument) {
      return;
    }

    if (!detail.visible) {
      if (options.insertionIndicatorEl.value) {
        options.insertionIndicatorEl.value.remove();
        options.insertionIndicatorEl.value = null;
      }
      return;
    }

    if (!options.insertionIndicatorEl.value) {
      options.insertionIndicatorEl.value =
        iframe.contentDocument.createElement("div");
      options.insertionIndicatorEl.value.className =
        "canvas-insertion-indicator";
      iframe.contentDocument.body.appendChild(
        options.insertionIndicatorEl.value,
      );
    }

    const rect = detail.rect as DOMRect;
    const position = detail.position as "before" | "after";
    const top = position === "before" ? rect.top : rect.bottom;

    const dragStyles = getStageDragInlineStyles(document);
    Object.assign(options.insertionIndicatorEl.value.style, {
      position: "absolute",
      left: `${rect.left}px`,
      top: `${top - 2}px`,
      width: `${rect.width}px`,
      height: "2px",
      background: dragStyles.insertionBackground,
      borderRadius: "2px",
      boxShadow: dragStyles.insertionBoxShadow,
      pointerEvents: "none",
      zIndex: String(IFRAME_Z_INDEX.insertion),
    });
  };

  const handleComponentSelected = (event: Event): void => {
    const detail = (event as CustomEvent).detail;
    options.emit("selectBlock", detail.nodeId);
  };

  const handleComponentDelete = (event: Event): void => {
    const detail = (event as CustomEvent).detail;
    options.emit("deleteBlock", detail.nodeId);
  };

  const handleGetComponentWrapper = (event: Event): void => {
    const detail = (event as CustomEvent).detail;
    const nodeId = detail.nodeId;

    const iframe = options.iframeRef.value;
    if (!iframe?.contentDocument) {
      return;
    }

    const element = iframe.contentDocument.querySelector(
      `[data-aria-id="${nodeId}"]`,
    );
    if (!element) {
      broadcastComponentWrapperResponse({ wrapperId: null });
      return;
    }

    let current = element.parentElement;
    while (current && current !== iframe.contentDocument.body) {
      if (current.hasAttribute("data-component-ref")) {
        const wrapperId = current.getAttribute("data-aria-id");
        broadcastComponentWrapperResponse({ wrapperId: wrapperId ?? null });
        return;
      }

      current = current.parentElement;
    }

    broadcastComponentWrapperResponse({ wrapperId: null });
  };

  onMounted(() => {
    window.addEventListener(
      "canvas:insertion-indicator",
      handleInsertionIndicator,
    );
    window.addEventListener("component:selected", handleComponentSelected);
    window.addEventListener("component:delete", handleComponentDelete);
    window.addEventListener("get-component-wrapper", handleGetComponentWrapper);
  });

  onUnmounted(() => {
    window.removeEventListener(
      "canvas:insertion-indicator",
      handleInsertionIndicator,
    );
    window.removeEventListener("component:selected", handleComponentSelected);
    window.removeEventListener("component:delete", handleComponentDelete);
    window.removeEventListener(
      "get-component-wrapper",
      handleGetComponentWrapper,
    );

    if (options.insertionIndicatorEl.value) {
      options.insertionIndicatorEl.value.remove();
      options.insertionIndicatorEl.value = null;
    }
  });
}
