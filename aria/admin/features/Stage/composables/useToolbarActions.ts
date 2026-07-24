/**
 * Toolbar actions from CanvasOverlayLayer.
 */

import type { BuilderNode } from "../../../../lib/types/nodes";
import type { UseCanvasOverlaysReturn } from "../../../composables/useCanvasOverlays";
import type { ToolbarActionName } from "../../../composables/useCanvasOverlays";
import type { UseComponentConversionReturn } from "./useComponentConversion";
import type { StageSelectBlockInput } from "../types";
import { useSignals } from "../../../composables/useSignals";
import {
  findStageNodeElement,
  readStageEditableNodeId,
} from "../utils/findStageNodeElement";

export interface UseToolbarActionsOptions {
  getDoc: () => Document | null;
  getBlocks: () => BuilderNode[];
  findNode: (blocks: BuilderNode[], id: string) => BuilderNode | null;
  syncSelectionToolbar: (nodeId: string) => void;
  canvasOverlays: UseCanvasOverlaysReturn;
  conversion: UseComponentConversionReturn;
  emit: {
    (e: "selectBlock", selection: StageSelectBlockInput): void;
    (e: "duplicateBlock", id: string): void;
    (e: "deleteBlock", id: string): void;
    (e: "detachComponent", id: string): void;
    (e: "editComponent", id: string): void;
  };
}

export function useToolbarActions(options: UseToolbarActionsOptions) {
  const {
    getDoc,
    getBlocks,
    findNode,
    syncSelectionToolbar,
    canvasOverlays,
    conversion,
    emit,
  } = options;

  const { broadcast } = useSignals();

  const handleToolbarAction = (
    action: ToolbarActionName,
    nodeId: string,
  ): void => {
    const iframeDoc = getDoc();
    if (!iframeDoc || !nodeId) return;

    if (import.meta.env.DEV) {
      console.log("[StageFrame] handleToolbarAction:", { action, nodeId });
    }

    switch (action) {
      case "select-parent": {
        const currentEl = findStageNodeElement(iframeDoc, getBlocks(), nodeId);
        const parentEl = currentEl?.parentElement?.closest<HTMLElement>(
          "[data-aria-id], [data-aria-template-id]",
        );
        if (parentEl) {
          const parentId = readStageEditableNodeId(parentEl);
          const parentType = parentEl.getAttribute("data-aria-type") || "div";
          if (parentId) {
            canvasOverlays.showSelection(parentEl, parentId, parentType);
            syncSelectionToolbar(parentId);
            emit("selectBlock", parentId);
          }
        }
        break;
      }

      case "create-component": {
        const node = findNode(getBlocks(), nodeId);
        if (node) {
          const nodeType =
            findStageNodeElement(iframeDoc, getBlocks(), nodeId)?.getAttribute(
              "data-aria-type",
            ) || node.type;
          const name = `${nodeType.charAt(0).toUpperCase()}${nodeType.slice(1)} Component`;
          conversion.openDialog(node, name);
        }
        break;
      }

      case "detach-component":
        emit("detachComponent", nodeId);
        canvasOverlays.hideSelection();
        break;

      case "edit-component": {
        const node = findNode(getBlocks(), nodeId);
        const masterId =
          node?.reference?.masterId ||
          node?.props?.componentId ||
          node?.componentRef ||
          node?.props?.["data-component-ref"];

        if (import.meta.env.DEV) {
          console.log("[StageFrame] Edit component clicked:", {
            nodeId,
            masterId,
            node,
          });
        }

        if (typeof masterId === "string" && masterId.trim().length > 0) {
          emit("editComponent", masterId);
        } else {
          console.warn("[StageFrame] No masterId found for component", node);
        }
        canvasOverlays.hideSelection();
        break;
      }

      case "duplicate":
        emit("duplicateBlock", nodeId);
        canvasOverlays.hideSelection();
        break;

      case "delete":
        emit("deleteBlock", nodeId);
        canvasOverlays.hideSelection();
        break;

      case "open-media-picker":
        broadcast("open-image-picker", { nodeId });
        break;
    }
  };

  return {
    handleToolbarAction,
  };
}
