import { onUnmounted } from "vue";

import type { BuilderNode, JsonObject } from "../../../../lib/types/nodes";
import { useCanvasSignalBridge } from "../../Core";
import {
  buildContentUpdates,
  buildContentValidationCandidate,
  getContentValue,
  isContentEditableType,
  isContentMultilineType,
} from "../../Inspector/composables/useContentContract";
import type { PropertySchemaKey } from "../../Inspector/composables/usePropertySchema";
import { getInlineEditableElement } from "../utils/nodeStyleRuntime";
import {
  collectNodeCandidatesAtPoint,
  collectNodeCandidatesFromElement,
  createFrameViewportPoint,
  resolveEventTargetElement,
  type NodeCandidate,
} from "../interaction";

interface UseStageInlineEditingOptions {
  getDoc: () => Document | null;
  getBlocks: () => BuilderNode[];
  findNode: (blocks: BuilderNode[], id: string) => BuilderNode | null;
  getCurrentItemType: () => "page" | "layout" | "component" | undefined | null;
  getCurrentItemSlug: () => string | undefined;
  safeParse: <K extends PropertySchemaKey>(
    schemaName: K,
    candidate: unknown,
  ) => unknown;
  saveProperties: (
    updates: Record<string, unknown>,
    itemType: "page" | "layout" | "component",
    itemSlug: string,
  ) => Promise<boolean>;
}

export function useStageInlineEditing(options: UseStageInlineEditingOptions) {
  const { broadcastPropsUpdate } = useCanvasSignalBridge();

  const INLINE_FLAG = "data-aria-inline-editing";
  const INLINE_NODE_ID = "data-aria-inline-node-id";
  const INLINE_NODE_TYPE = "data-aria-inline-node-type";
  const INLINE_ORIGINAL = "data-aria-inline-original";

  let activeDoc: Document | null = null;
  let cleanupListeners: (() => void) | null = null;

  const resolveInlineEditTarget = (
    iframeDoc: Document,
    event: MouseEvent,
  ): NodeCandidate | null => {
    const pointCandidates = collectNodeCandidatesAtPoint(
      iframeDoc,
      createFrameViewportPoint(event.clientX, event.clientY),
      { lockComponentInstances: true },
    );
    const fallbackCandidates = collectNodeCandidatesFromElement(
      resolveEventTargetElement(event.target),
      { lockComponentInstances: true },
    );

    return (
      [...pointCandidates, ...fallbackCandidates].find((candidate) =>
        isContentEditableType(candidate.nodeType.toLowerCase()),
      ) ?? null
    );
  };

  const clearInlineState = (el: HTMLElement): void => {
    el.removeAttribute("contenteditable");
    el.removeAttribute(INLINE_FLAG);
    el.removeAttribute(INLINE_NODE_ID);
    el.removeAttribute(INLINE_NODE_TYPE);
    el.removeAttribute(INLINE_ORIGINAL);
  };

  const saveInlineText = async (el: HTMLElement): Promise<void> => {
    const nodeId = el.getAttribute(INLINE_NODE_ID);
    const nodeType = el.getAttribute(INLINE_NODE_TYPE) ?? "";
    const original = el.getAttribute(INLINE_ORIGINAL) ?? "";

    if (!nodeId || !isContentEditableType(nodeType)) {
      clearInlineState(el);
      return;
    }

    const node = options.findNode(options.getBlocks(), nodeId);
    const currentItemType = options.getCurrentItemType();
    const currentItemSlug = options.getCurrentItemSlug();
    if (!node || !currentItemType || !currentItemSlug) {
      clearInlineState(el);
      return;
    }

    const nextText = (el.textContent ?? "").trim();
    const previousText = getContentValue(node);

    if (nextText === previousText) {
      clearInlineState(el);
      return;
    }

    const updates = buildContentUpdates(node, nextText);
    const candidate = buildContentValidationCandidate(node, updates);
    const validation = options.safeParse("text", candidate);
    const valid =
      typeof validation === "object" &&
      validation !== null &&
      "success" in validation &&
      (validation as { success: boolean }).success;

    if (!valid) {
      el.textContent = original;
      clearInlineState(el);
      return;
    }

    const success = await options.saveProperties(
      updates,
      currentItemType,
      currentItemSlug,
    );

    if (!success) {
      el.textContent = original;
    }

    clearInlineState(el);
  };

  const cancelInlineText = (el: HTMLElement): void => {
    const original = el.getAttribute(INLINE_ORIGINAL);
    if (typeof original === "string") {
      el.textContent = original;
    }

    clearInlineState(el);
  };

  const emitLiveInlineText = (el: HTMLElement): void => {
    const nodeId = el.getAttribute(INLINE_NODE_ID);
    const nodeType = el.getAttribute(INLINE_NODE_TYPE) ?? "";

    if (!nodeId || !isContentEditableType(nodeType)) {
      return;
    }

    const node = options.findNode(options.getBlocks(), nodeId);
    if (!node) {
      return;
    }

    const nextText = el.textContent ?? "";
    const updates = buildContentUpdates(node, nextText);

    broadcastPropsUpdate({
      nodeId,
      props: updates as JsonObject,
      source: "stage-inline-live",
    });
  };

  const teardown = (): void => {
    cleanupListeners?.();
    cleanupListeners = null;
    activeDoc = null;
  };

  const setupInlineTextEditing = (): void => {
    const iframeDoc = options.getDoc();
    if (!iframeDoc) {
      return;
    }

    if (cleanupListeners && activeDoc === iframeDoc) {
      return;
    }

    teardown();
    activeDoc = iframeDoc;

    const handleDblClick = (event: MouseEvent): void => {
      const inlineTarget = resolveInlineEditTarget(iframeDoc, event);
      if (!inlineTarget) {
        return;
      }

      const blockEl = inlineTarget.element;
      const nodeType = inlineTarget.nodeType.toLowerCase();
      if (!isContentEditableType(nodeType)) {
        return;
      }

      const editable = getInlineEditableElement(blockEl, nodeType);
      if (!editable) {
        return;
      }

      const nodeId = inlineTarget.nodeId;
      if (!nodeId) {
        return;
      }

      editable.setAttribute("contenteditable", "true");
      editable.setAttribute(INLINE_FLAG, "true");
      editable.setAttribute(INLINE_NODE_ID, nodeId);
      editable.setAttribute(INLINE_NODE_TYPE, nodeType);
      editable.setAttribute(INLINE_ORIGINAL, editable.textContent ?? "");

      editable.focus();

      const selection = iframeDoc.defaultView?.getSelection();
      if (selection) {
        const range = iframeDoc.createRange();
        range.selectNodeContents(editable);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      event.preventDefault();
      event.stopPropagation();
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target || target.getAttribute(INLINE_FLAG) !== "true") {
        return;
      }

      const nodeType = target.getAttribute(INLINE_NODE_TYPE) ?? "";
      const multiline = isContentMultilineType(nodeType);

      if (event.key === "Escape") {
        cancelInlineText(target);
        event.preventDefault();
        return;
      }

      if (event.key === "Enter" && !multiline && !event.shiftKey) {
        void saveInlineText(target);
        event.preventDefault();
      }
    };

    const handleFocusOut = (event: FocusEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target || target.getAttribute(INLINE_FLAG) !== "true") {
        return;
      }

      void saveInlineText(target);
    };

    const handleInput = (event: Event): void => {
      const target = event.target as HTMLElement | null;
      if (!target || target.getAttribute(INLINE_FLAG) !== "true") {
        return;
      }

      emitLiveInlineText(target);
    };

    iframeDoc.addEventListener("dblclick", handleDblClick, true);
    iframeDoc.addEventListener("keydown", handleKeyDown, true);
    iframeDoc.addEventListener("focusout", handleFocusOut, true);
    iframeDoc.addEventListener("input", handleInput, true);

    cleanupListeners = () => {
      iframeDoc.removeEventListener("dblclick", handleDblClick, true);
      iframeDoc.removeEventListener("keydown", handleKeyDown, true);
      iframeDoc.removeEventListener("focusout", handleFocusOut, true);
      iframeDoc.removeEventListener("input", handleInput, true);
    };
  };

  onUnmounted(() => {
    teardown();
  });

  return {
    setupInlineTextEditing,
  };
}
