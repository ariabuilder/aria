import { onUnmounted, watch, type Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import {
  useShellSignalBridge,
  type AgentCanvasBuildSignalPayload,
} from "../../Core";
import { resolveAdminPrimaryColor } from "../styles/stageDropFeedback";
import { findStageNodeElement } from "../utils/findStageNodeElement";

const REVEAL_DURATION_MS = 900;
const NODE_LOOKUP_FRAME_LIMIT = 240;
const REVEAL_ATTRIBUTE = "data-aria-agent-section-reveal";

export interface AgentCanvasFollowController {
  start: (runId: string) => void;
  disable: () => void;
  finish: (runId: string) => void;
  shouldFollow: (runId: string) => boolean;
  activeRunId: () => string | null;
}

export function createAgentCanvasFollowController(): AgentCanvasFollowController {
  let runId: string | null = null;
  let enabled = false;

  return {
    start(nextRunId) {
      runId = nextRunId;
      enabled = true;
    },
    disable() {
      enabled = false;
    },
    finish(finishedRunId) {
      if (runId !== finishedRunId) return;
      runId = null;
      enabled = false;
    },
    shouldFollow(candidateRunId) {
      return enabled && runId === candidateRunId;
    },
    activeRunId() {
      return runId;
    },
  };
}

function nextFrame(win: Window): Promise<void> {
  return new Promise((resolve) => {
    win.requestAnimationFrame(() => resolve());
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useAgentCanvasBuildPresentation(input: {
  iframeRef: Ref<HTMLIFrameElement | null>;
  getBlocks: () => BuilderNode[];
  primarySelectedNodeId: Readonly<Ref<string | null>>;
}): void {
  const follow = createAgentCanvasFollowController();
  const shellSignals = useShellSignalBridge();
  let selectionAtBuildStart: string | null = null;
  let revealElement: HTMLDivElement | null = null;
  let revealTimeoutId: number | null = null;
  let revealFrameId: number | null = null;
  let lookupGeneration = 0;
  let boundDocument: Document | null = null;

  const disableFollow = (): void => follow.disable();

  const handleCanvasKeydown = (event: KeyboardEvent): void => {
    if (
      [
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "End",
        "Home",
        "PageDown",
        "PageUp",
        " ",
      ].includes(event.key)
    ) {
      disableFollow();
    }
  };

  const unbindCanvasInteractions = (): void => {
    if (!boundDocument) return;
    boundDocument.removeEventListener("pointerdown", disableFollow, true);
    boundDocument.removeEventListener("touchstart", disableFollow, true);
    boundDocument.removeEventListener("wheel", disableFollow, true);
    boundDocument.removeEventListener("keydown", handleCanvasKeydown, true);
    boundDocument = null;
  };

  const bindCanvasInteractions = (): void => {
    const doc = input.iframeRef.value?.contentDocument ?? null;
    if (!doc || doc === boundDocument) return;
    unbindCanvasInteractions();
    boundDocument = doc;
    doc.addEventListener("pointerdown", disableFollow, true);
    doc.addEventListener("touchstart", disableFollow, {
      capture: true,
      passive: true,
    });
    doc.addEventListener("wheel", disableFollow, {
      capture: true,
      passive: true,
    });
    doc.addEventListener("keydown", handleCanvasKeydown, true);
  };

  const clearReveal = (): void => {
    if (revealTimeoutId !== null) {
      window.clearTimeout(revealTimeoutId);
      revealTimeoutId = null;
    }
    const win = input.iframeRef.value?.contentWindow;
    if (revealFrameId !== null && win) {
      win.cancelAnimationFrame(revealFrameId);
      revealFrameId = null;
    }
    revealElement?.remove();
    revealElement = null;
  };

  const waitForNodeElement = async (
    nodeId: string,
    generation: number,
  ): Promise<HTMLElement | null> => {
    for (let frame = 0; frame < NODE_LOOKUP_FRAME_LIMIT; frame += 1) {
      if (generation !== lookupGeneration) return null;
      const iframe = input.iframeRef.value;
      const doc = iframe?.contentDocument;
      const win = iframe?.contentWindow;
      if (doc && win) {
        const element = findStageNodeElement(doc, input.getBlocks(), nodeId);
        if (element) return element;
        await nextFrame(win);
      } else {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 16);
        });
      }
    }
    return null;
  };

  const revealSection = async (
    payload: Extract<
      AgentCanvasBuildSignalPayload,
      { phase: "section-inserted" }
    >,
  ): Promise<void> => {
    const generation = ++lookupGeneration;
    const element = await waitForNodeElement(payload.nodeIds[0], generation);
    const iframe = input.iframeRef.value;
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow;
    if (!element || !doc || !win || generation !== lookupGeneration) return;

    if (follow.shouldFollow(payload.runId)) {
      element.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
      await nextFrame(win);
      await nextFrame(win);
    }

    clearReveal();
    const outline = doc.createElement("div");
    outline.setAttribute(REVEAL_ATTRIBUTE, String(payload.sequence));
    outline.setAttribute("aria-hidden", "true");
    Object.assign(outline.style, {
      border: `2px solid ${resolveAdminPrimaryColor()}`,
      borderRadius: "6px",
      boxShadow: `0 0 0 4px color-mix(in srgb, ${resolveAdminPrimaryColor()} 22%, transparent), 0 0 28px color-mix(in srgb, ${resolveAdminPrimaryColor()} 28%, transparent)`,
      boxSizing: "border-box",
      opacity: "1",
      pointerEvents: "none",
      position: "fixed",
      transition: prefersReducedMotion() ? "none" : "opacity 240ms ease",
      zIndex: "2147483000",
    });
    doc.body.appendChild(outline);
    revealElement = outline;

    const syncOutline = (): void => {
      if (!outline.isConnected || !element.isConnected) return;
      const rect = element.getBoundingClientRect();
      Object.assign(outline.style, {
        height: `${Math.max(0, rect.height)}px`,
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${Math.max(0, rect.width)}px`,
      });
      revealFrameId = win.requestAnimationFrame(syncOutline);
    };
    syncOutline();

    revealTimeoutId = window.setTimeout(() => {
      outline.style.opacity = "0";
      revealTimeoutId = window.setTimeout(clearReveal, 260);
    }, REVEAL_DURATION_MS);
  };

  const handleBuildSignal = (
    payload: AgentCanvasBuildSignalPayload,
  ): void => {
    if (payload.phase === "started") {
      lookupGeneration += 1;
      clearReveal();
      selectionAtBuildStart = input.primarySelectedNodeId.value;
      follow.start(payload.runId);
      bindCanvasInteractions();
      return;
    }

    if (payload.phase === "section-inserted") {
      if (follow.activeRunId() === payload.runId) {
        void revealSection(payload);
      }
      return;
    }

    follow.finish(payload.runId);
  };

  shellSignals.onAgentCanvasBuild(handleBuildSignal);

  watch(input.primarySelectedNodeId, (nodeId) => {
    if (
      follow.activeRunId() &&
      nodeId !== selectionAtBuildStart
    ) {
      follow.disable();
    }
  });

  watch(
    input.iframeRef,
    (iframe, previousIframe) => {
      previousIframe?.removeEventListener("load", bindCanvasInteractions);
      iframe?.addEventListener("load", bindCanvasInteractions);
      bindCanvasInteractions();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    lookupGeneration += 1;
    input.iframeRef.value?.removeEventListener(
      "load",
      bindCanvasInteractions,
    );
    unbindCanvasInteractions();
    clearReveal();
  });
}
