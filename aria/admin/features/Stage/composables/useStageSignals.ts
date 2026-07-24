/**
 * Registers StageFrame signal handlers (selection, scroll, highlight, etc. ).
 */

import { z } from "zod";

import type { Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { findStageNodeElement } from "../utils/findStageNodeElement";
import type {
  ScrollToNodePayload,
  HighlightNodePayload,
  NodeInfo,
  NodeLocationInfo,
  StageSelectBlockInput,
} from "../types";
import type { UseComponentConversionReturn } from "./useComponentConversion";
import {
  useCanvasInteractionBridge,
  useStageSignalBridge,
  type UnoRuntimeConfig,
} from "../../Core";
import { log } from "@/lib/utils/logger";

interface UnoRuntimeWindow extends Window {
  __unocss?: UnoRuntimeConfig;
  __unocss_runtime?: {
    uno?: {
      setConfig: (config: UnoRuntimeConfig) => Promise<void>;
    };
    update?: () => void;
  };
}

const UnoRuntimeThemeSchema = z
  .looseObject({
    colors: z.record(z.string(), z.unknown()),
  });

const UnoRuntimeConfigSchema = z
  .looseObject({
    theme: UnoRuntimeThemeSchema,
    shortcuts: z.record(z.string(), z.string()).optional(),
    safelist: z.array(z.string()).optional(),
    presets: z.array(z.unknown()).optional(),
  });

const parseUnoRuntimeConfig = (json: string): UnoRuntimeConfig | null => {
  try {
    const parsed = UnoRuntimeConfigSchema.safeParse(JSON.parse(json));
    if (!parsed.success) {
      return null;
    }

    const theme = parsed.data.theme;
    const breakpoint =
      (theme.breakpoint as UnoRuntimeConfig["theme"]["breakpoint"]) ??
      (theme.breakpoints as UnoRuntimeConfig["theme"]["breakpoint"]);
    return {
      theme: {
        colors: theme.colors as UnoRuntimeConfig["theme"]["colors"],
        breakpoint,
        fontFamily: theme.fontFamily as UnoRuntimeConfig["theme"]["fontFamily"],
        spacing: theme.spacing as UnoRuntimeConfig["theme"]["spacing"],
        borderRadius:
          theme.borderRadius as UnoRuntimeConfig["theme"]["borderRadius"],
        boxShadow: theme.boxShadow as UnoRuntimeConfig["theme"]["boxShadow"],
      },
      shortcuts: parsed.data.shortcuts,
      safelist: parsed.data.safelist,
      presets: parsed.data.presets,
    };
  } catch {
    return null;
  }
};

function getNodeDisplayName(node: BuilderNode): string {
  const value = node.props?.name;
  return typeof value === "string" && value.trim().length > 0
    ? value
    : "New Component";
}

export interface UseStageSignalsOptions {
  emit: {
    (e: "selectBlock", selection: StageSelectBlockInput): void;
    (e: "addBlock", block: BuilderNode, parentId: string | null): void;
    (e: "deleteBlock", id: string): void;
  };
  iframeRef: Ref<HTMLIFrameElement | null>;
  getBlocks: () => BuilderNode[];
  findNodeWithParent: (blocks: BuilderNode[], id: string) => NodeInfo | null;
  findNodeLocation: (
    blocks: BuilderNode[],
    id: string,
  ) => NodeLocationInfo | null;
  conversion: UseComponentConversionReturn;
  canvasReorder: {
    initializeDragButton: (
      toolbar: HTMLElement,
      nodeId: string,
      parentId: string | null,
      index: number,
    ) => void;
  };
  canvasOverlays: {
    showHover: (element: Element, nodeId: string) => void;
    showSelection: (
      element: Element,
      nodeId: string,
      nodeType?: string,
      options?: { emitSignal?: boolean },
    ) => void;
    hideHover: () => void;
  };
  syncSelectionToolbar: (nodeId: string) => void;
  scrollBehavior: ScrollBehavior;
  scrollBlock: ScrollLogicalPosition;
}

export function useStageSignals(options: UseStageSignalsOptions) {
  const {
    emit,
    iframeRef,
    getBlocks,
    findNodeWithParent,
    conversion,
    canvasOverlays,
    syncSelectionToolbar,
    scrollBehavior,
    scrollBlock,
  } = options;
  const {
    onNodeSelected,
    onDeleteBlock,
    onAddBlock,
    onConvertComponent,
    onUnoConfigChanged,
  } = useStageSignalBridge();
  const { onScrollToNode, onHighlightNode } = useCanvasInteractionBridge();

  onNodeSelected((payload) => {
    emit("selectBlock", payload.nodeId);
  });

  onDeleteBlock((payload) => {
    emit("deleteBlock", payload.nodeId);
  });

  onAddBlock((payload) => {
    emit("addBlock", payload.block, payload.parentId);
  });

  onConvertComponent((nodeId) => {
    if (!nodeId) return;

    const nodeInfo = findNodeWithParent(getBlocks(), nodeId);
    if (nodeInfo) {
      const name = getNodeDisplayName(nodeInfo.node);
      conversion.openDialog(nodeInfo.node, name);
    }
  });

  onUnoConfigChanged(async (payload) => {
    const iframe = iframeRef.value;
    const doc = iframe?.contentDocument;
    if (!doc) {
      log("warn", "[StageFrame] uno-config-changed: document not ready");
      return;
    }

    const iframeWindow = iframe?.contentWindow as UnoRuntimeWindow | undefined;

    if (!iframeWindow) {
      log("warn", "[StageFrame] uno-config-changed: iframe not ready");
      return;
    }

    const parsedConfig = parseUnoRuntimeConfig(payload.configJSON);
    if (!parsedConfig) {
      log("warn", "[StageFrame] uno-config-changed: invalid config payload");
      return;
    }

    const unoRuntime = iframeWindow.__unocss_runtime?.uno;
    if (unoRuntime) {
      const baseConfig = iframeWindow.__unocss ?? parsedConfig;
      const newConfig: UnoRuntimeConfig = {
        ...baseConfig,
        theme: parsedConfig.theme,
      };

      try {
        await unoRuntime.setConfig(newConfig);
        iframeWindow.__unocss_runtime?.update?.();

        log(
          "debug",
          "[StageFrame] UnoCSS config updated via setConfig + update",
          {
            colorsCount: Object.keys(parsedConfig.theme?.colors || {}).length,
          },
        );
      } catch (error) {
        log(
          "error",
          "[StageFrame] Failed to update UnoCSS config via runtime",
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
  });

  onScrollToNode((payload: ScrollToNodePayload) => {
    const iframe = iframeRef.value;
    if (!iframe?.contentDocument) {
      log("warn", "[StageFrame] scroll-to-node: iframe not ready");
      return;
    }

    let element =
      iframe.contentDocument.querySelector(
        `[data-zone-id="${payload.nodeId}"]`,
      ) ??
      findStageNodeElement(iframe.contentDocument, getBlocks(), payload.nodeId);

    if (!element) {
      const allZoneIds = Array.from(
        iframe.contentDocument.querySelectorAll("[data-zone-id]"),
      ).map((entry) => entry.getAttribute("data-zone-id"));
      const allAriaIds = Array.from(
        iframe.contentDocument.querySelectorAll("[data-aria-id]"),
      ).map((entry) => entry.getAttribute("data-aria-id"));
      log("warn", "[StageFrame] scroll-to-node: element not found", {
        nodeId: payload.nodeId,
        allZoneIds,
        allAriaIds,
      });
      return;
    }

    if (!element.hasAttribute("data-component-ref")) {
      let ancestor: Element | null = element;
      while (ancestor && ancestor !== iframe.contentDocument.documentElement) {
        if (ancestor.hasAttribute("data-component-ref")) {
          element = ancestor;
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }

    element.scrollIntoView({
      behavior: scrollBehavior,
      block: scrollBlock,
    });

    const nodeType = element.getAttribute("data-component-ref")
      ? "Component"
      : element.getAttribute("data-aria-type") || "div";
    log("debug", "[StageFrame] scroll-to-node showing selection", {
      nodeId: payload.nodeId,
      nodeType,
    });
    canvasOverlays.showSelection(element, payload.nodeId, nodeType, {
      emitSignal: false,
    });
    syncSelectionToolbar(payload.nodeId);
  });

  onHighlightNode((payload: HighlightNodePayload) => {
    const iframe = iframeRef.value;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    const nodeId = payload?.nodeId;
    if (!nodeId) {
      canvasOverlays.hideHover();
      return;
    }

    const element = findStageNodeElement(doc, getBlocks(), nodeId);
    if (element) {
      canvasOverlays.showHover(element as Element, nodeId);
    }
  });
}
