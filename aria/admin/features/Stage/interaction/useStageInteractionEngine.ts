import { onUnmounted, watch, type Ref } from "vue";
import {
  createFrameViewportRect,
  frameViewportRectToParentViewport,
  type ParentViewportRect,
  type ViewportRect,
} from "./geometry";
import {
  createIframeOverlayRenderer,
  type IframeOverlayRenderer,
} from "./iframeOverlayRenderer";
import type { VisualOverlayDescriptor } from "./overlayDescriptors";

export interface UseStageInteractionEngineOptions {
  iframeRef: Ref<HTMLIFrameElement | null>;
}

export interface UseStageInteractionEngineReturn {
  renderVisualOverlays: (
    descriptors: readonly VisualOverlayDescriptor[],
  ) => void;
  clearVisualOverlays: () => void;
  showAddElementsDropFeedback: (
    placeholder: ViewportRect,
    target?: ViewportRect | null,
    orientation?: "horizontal" | "vertical",
  ) => void;
  hideAddElementsDropFeedback: () => void;
  projectFrameRectToParent: (rect: ViewportRect) => ParentViewportRect | null;
  cleanup: () => void;
}

export function useStageInteractionEngine({
  iframeRef,
}: UseStageInteractionEngineOptions): UseStageInteractionEngineReturn {
  let renderer: IframeOverlayRenderer | null = null;

  function ensureRenderer(): IframeOverlayRenderer | null {
    const iframe = iframeRef.value;
    if (!iframe) {
      renderer?.destroy();
      renderer = null;
      return null;
    }

    if (renderer) {
      return renderer;
    }

    renderer = createIframeOverlayRenderer({ iframe });
    return renderer;
  }

  function renderVisualOverlays(
    descriptors: readonly VisualOverlayDescriptor[],
  ): void {
    ensureRenderer()?.render(descriptors);
  }

  function clearVisualOverlays(): void {
    renderer?.clear();
  }

  function showAddElementsDropFeedback(
    placeholder: ViewportRect,
    target: ViewportRect | null = null,
    orientation: "horizontal" | "vertical" = "horizontal",
  ): void {
    const descriptors: VisualOverlayDescriptor[] = [
      {
        kind: "insertion",
        id: "library-insertion",
        rect: createFrameViewportRect(placeholder),
        orientation,
        variant: "library",
      },
    ];

    if (target) {
      descriptors.push({
        kind: "target-outline",
        id: "library-target",
        nodeId: "library-target",
        rect: createFrameViewportRect(target),
        variant: "empty-container",
      });
    }

    renderVisualOverlays(descriptors);
  }

  function hideAddElementsDropFeedback(): void {
    clearVisualOverlays();
  }

  function projectFrameRectToParent(
    rect: ViewportRect,
  ): ParentViewportRect | null {
    const iframe = iframeRef.value;
    if (!iframe) {
      return null;
    }

    return frameViewportRectToParentViewport(
      createFrameViewportRect(rect),
      iframe.getBoundingClientRect(),
      1,
    );
  }

  function cleanup(): void {
    renderer?.destroy();
    renderer = null;
  }

  watch(
    () => iframeRef.value,
    () => {
      cleanup();
    },
  );

  onUnmounted(cleanup);

  return {
    renderVisualOverlays,
    clearVisualOverlays,
    showAddElementsDropFeedback,
    hideAddElementsDropFeedback,
    projectFrameRectToParent,
    cleanup,
  };
}
