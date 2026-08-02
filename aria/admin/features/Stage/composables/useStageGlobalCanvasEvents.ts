import { onMounted, onUnmounted, type Ref } from "vue";
import { z } from "zod";

import { useCanvasSignalBridge } from "../../Core";
import type { StageSelectBlockInput } from "../types";
import type { OverlayPosition } from "../../../composables/useCanvasOverlays";

const ViewportRectSchema = z
  .object({
    left: z.number(),
    top: z.number(),
    width: z.number().min(0),
    height: z.number().min(0),
  })
  .strict();

const InsertionIndicatorDetailSchema = z.discriminatedUnion("visible", [
  z.object({ visible: z.literal(false) }).strict(),
  z
    .object({
      visible: z.literal(true),
      nodeId: z.string().min(1),
      position: z.enum(["before", "after"]),
      rect: ViewportRectSchema,
    })
    .strict(),
]);

const NodeEventDetailSchema = z
  .object({
    nodeId: z.string().min(1),
  })
  .strict();

interface UseStageGlobalCanvasEventsOptions {
  iframeRef: Ref<HTMLIFrameElement | null>;
  canvasOverlays: {
    showFrameInsertion: (
      position: OverlayPosition,
      orientation?: "horizontal" | "vertical",
    ) => void;
    hideInsertion: () => void;
  };
  emit: {
    (e: "selectBlock", selection: StageSelectBlockInput): void;
    (e: "deleteBlock", id: string): void;
  };
}

function readCustomEventDetail(event: Event): unknown {
  return "detail" in event ? Reflect.get(event, "detail") : undefined;
}

export function useStageGlobalCanvasEvents(
  options: UseStageGlobalCanvasEventsOptions,
): void {
  const { broadcastComponentWrapperResponse } = useCanvasSignalBridge();

  const handleInsertionIndicator = (event: Event): void => {
    const parsed = InsertionIndicatorDetailSchema.safeParse(
      readCustomEventDetail(event),
    );
    if (!parsed.success) {
      return;
    }

    const detail = parsed.data;
    if (!detail.visible) {
      options.canvasOverlays.hideInsertion();
      return;
    }

    const top =
      detail.position === "before"
        ? detail.rect.top
        : detail.rect.top + detail.rect.height;
    options.canvasOverlays.showFrameInsertion(
      {
        left: detail.rect.left,
        top: top - 2,
        width: detail.rect.width,
        height: 3,
      },
      "horizontal",
    );
  };

  const handleComponentSelected = (event: Event): void => {
    const parsed = NodeEventDetailSchema.safeParse(readCustomEventDetail(event));
    if (parsed.success) {
      options.emit("selectBlock", parsed.data.nodeId);
    }
  };

  const handleComponentDelete = (event: Event): void => {
    const parsed = NodeEventDetailSchema.safeParse(readCustomEventDetail(event));
    if (parsed.success) {
      options.emit("deleteBlock", parsed.data.nodeId);
    }
  };

  const handleGetComponentWrapper = (event: Event): void => {
    const parsed = NodeEventDetailSchema.safeParse(readCustomEventDetail(event));
    if (!parsed.success) {
      return;
    }
    const nodeId = parsed.data.nodeId;

    const iframe = options.iframeRef.value;
    if (!iframe?.contentDocument) {
      return;
    }

    const element = iframe.contentDocument.querySelector<HTMLElement>(
      `[data-aria-id="${CSS.escape(nodeId)}"]`,
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
    options.canvasOverlays.hideInsertion();
  });
}
