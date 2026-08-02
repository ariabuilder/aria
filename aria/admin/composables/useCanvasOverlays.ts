/**
 * Canvas overlays (hover, selection, insertion, drop zones).
 * RAF-batched coords; throttled signals for hover/select events.
 */

import { reactive, onUnmounted, watch, type Ref } from "vue";
import type { BuilderNode } from "../../lib/types/nodes";
import type { CanvasAffordanceDescriptor } from "../../lib/rendering/canonical";
import type { CanvasSelectionGesture } from "../features/Core/composables/useCanvasInteractionBridge";
import { useCanvasInteractionBridge } from "../features/Core";
import {
  getContentStyleTargetElement,
  getInlineEditableElement,
} from "../features/Stage/utils/nodeStyleRuntime";
import {
  elementMatchesStageNodeId,
  findStageNodeElement,
} from "../features/Stage/utils/findStageNodeElement";
import { resolveAdminPrimaryColor } from "../features/Stage/styles/stageDropFeedback";
import { toolbarIcons } from "../lib/icons";
import { IFRAME_Z_INDEX, Z_INDEX } from "@/lib/zIndex";
import {
  registerCanvasOverlayPositionScheduler,
  unregisterCanvasOverlayPositionScheduler,
} from "./canvasOverlayRefresh";

export interface OverlayPosition {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RelativeOverlayBounds {
  leftInset: number;
  topInset: number;
  width: number;
  height: number;
}

export interface HoverState {
  visible: boolean;
  nodeId: string | null;
  element: Element | null;
  position: OverlayPosition | null;
}

export interface SelectionState {
  visible: boolean;
  nodeId: string | null;
  nodeType: string;
  element: Element | null;
  position: OverlayPosition | null;
  lockedBounds: RelativeOverlayBounds | null;
  hasParent: boolean;
  isComponent: boolean;
}

export interface SecondarySelectionState {
  nodeId: string;
  nodeType: string;
  element: Element | null;
  position: OverlayPosition | null;
  lockedBounds: RelativeOverlayBounds | null;
}

export interface OverlaySelectionTarget {
  element: Element;
  nodeId: string;
  nodeType?: string;
}

export interface InsertionState {
  visible: boolean;
  position: OverlayPosition | null;
  orientation: "horizontal" | "vertical";
}

export interface DropZoneState {
  visible: boolean;
  zones: Array<{
    id: string;
    position: OverlayPosition;
    isActive: boolean;
  }>;
}

export interface AddElementsDropState {
  visible: boolean;
  placeholder: OverlayPosition | null;
  target: OverlayPosition | null;
  orientation: "horizontal" | "vertical";
}

export type { CanvasAffordanceDescriptor };

export interface ToolbarAction {
  name: string;
  icon: string;
  title: string;
  className?: string;
}

export interface OverlaySignalOptions {
  emitSignal?: boolean;
  triggerGesture?: CanvasSelectionGesture;
}

export type OverlayUpdateMode = "measure" | "translate";

export type ToolbarActionName =
  | "select-parent"
  | "create-component"
  | "detach-component"
  | "edit-component"
  | "duplicate"
  | "delete"
  | "open-media-picker";

const HOVER_SIGNAL_THROTTLE_MS = 100;

const ICON_MAP: Record<string, string> = {
  heading: "Heading",
  text: "Type",
  paragraph: "AlignLeft",
  button: "MousePointerClick",
  image: "Image",
  icon: "Star",
  container: "Container",
  section: "Box",
  div: "Square",
  link: "Link",
  Component: "Link2",
};

// Iconify class names for toolbar actions
const TOOLBAR_ICONS: Record<string, string> = {
  "select-parent": toolbarIcons.selectParent,
  drag: toolbarIcons.drag,
  "create-component": toolbarIcons.createComponent,
  "detach-component": toolbarIcons.detachComponent,
  "edit-component": toolbarIcons.editComponent,
  duplicate: toolbarIcons.duplicate,
  delete: toolbarIcons.delete,
  component: toolbarIcons.component,
  element: toolbarIcons.element,
  section: toolbarIcons.section,
  icon: toolbarIcons.icon,
  "open-media-picker": toolbarIcons.openMediaPicker,
  loop: toolbarIcons.loop,
  motion: toolbarIcons.motion,
};

// MODULE-LEVEL STATE (Singleton pattern like useBeacon)

const hoverState = reactive<HoverState>({
  visible: false,
  nodeId: null,
  element: null,
  position: null,
});

const selectionState = reactive<SelectionState>({
  visible: false,
  nodeId: null,
  nodeType: "div",
  element: null,
  position: null,
  lockedBounds: null,
  hasParent: false,
  isComponent: false,
});

const insertionState = reactive<InsertionState>({
  visible: false,
  position: null,
  orientation: "horizontal",
});

// Add-elements library drag feedback (placeholder + target indicators)
const addElementsDropState = reactive<AddElementsDropState>({
  visible: false,
  placeholder: null,
  target: null,
  orientation: "vertical",
});

const dropZoneState = reactive<DropZoneState>({
  visible: false,
  zones: [],
});

const canvasAffordanceState = reactive<CanvasAffordanceDescriptor[]>([]);
let frameAffordanceDescriptors: CanvasAffordanceDescriptor[] = [];
let frameAffordanceCaptureScroll = { left: 0, top: 0 };

let iframeHoverOverlayEl: HTMLElement | null = null;
let iframeSelectionOverlayEl: HTMLElement | null = null;
let iframeSelectionGhostOverlayEl: HTMLElement | null = null;
let iframeSecondarySelectionOverlayEls: HTMLElement[] = [];

const secondarySelectionStates = reactive<SecondarySelectionState[]>([]);

let overlayRuntime: {
  iframeRef?: Ref<HTMLIFrameElement | null>;
  getBlocks?: () => BuilderNode[];
  getOffset: () => IframeViewportMapping;
} | null = null;

const selectionGhostState = reactive<{
  visible: boolean;
  position: OverlayPosition | null;
}>({
  visible: false,
  position: null,
});

const IFRAME_OVERLAY_ROOT_ATTR = "data-aria-stage-overlay-root";

let rafId: number | null = null;
let lastHoverSignalTime = 0;
let scrollFollowRafId: number | null = null;
let lastScrollActivityTime = 0;
const SCROLL_FOLLOW_SETTLE_MS = 120;
const TEXT_BOUND_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "a",
  "span",
  "li",
  "blockquote",
]);
const INLINE_TEXT_MEASUREMENT_NODE_TYPES = new Set([
  "heading",
  "text",
  "paragraph",
]);
const STRUCTURAL_BOX_NODE_TYPES = new Set([
  "section",
  "container",
  "header",
  "footer",
  "main",
  "nav",
  "grid",
  "columns",
  "column",
]);
const CONTENTFUL_TAGS = new Set([
  "a",
  "button",
  "canvas",
  "iframe",
  "img",
  "input",
  "select",
  "svg",
  "textarea",
  "video",
]);
const TEXT_SELECTION_PADDING_PX = 4;

interface OverlayThemeColors {
  border: string;
  hoverBackground: string;
  hoverShadow: string;
  selectionBackground: string;
  ghostBackground: string;
  ghostBorder: string;
}

interface IframeViewportMapping {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Map iframe-document coordinates to the host viewport, including artboard scale.
 */
function getIframeViewportMapping(
  iframe: HTMLIFrameElement | null,
): IframeViewportMapping {
  if (!iframe) {
    return { left: 0, top: 0, scaleX: 1, scaleY: 1 };
  }

  const rect = iframe.getBoundingClientRect();
  const scaleX = iframe.clientWidth > 0 ? rect.width / iframe.clientWidth : 1;
  const scaleY =
    iframe.clientHeight > 0 ? rect.height / iframe.clientHeight : 1;

  return { left: rect.left, top: rect.top, scaleX, scaleY };
}

function mapLocalOverlayToHostViewport(
  position: OverlayPosition,
  mapping: IframeViewportMapping,
): OverlayPosition {
  return {
    left: mapping.left + position.left * mapping.scaleX,
    top: mapping.top + position.top * mapping.scaleY,
    width: position.width * mapping.scaleX,
    height: position.height * mapping.scaleY,
  };
}

/**
 * Calculate element position in host viewport coordinates.
 * Tries to use actual content bounds for better selection isolation.
 */
function calculatePosition(
  element: Element,
  mapping: IframeViewportMapping,
): OverlayPosition {
  let rect = element.getBoundingClientRect();
  const nodeType = (
    element.getAttribute("data-aria-type") || element.tagName
  ).toLowerCase();

  if (
    element.hasAttribute("data-component-ref") &&
    element.children.length > 0
  ) {
    const descendantRects = collectMeaningfulDescendantRects(element);
    const descendantBounds = buildOverlayPositionFromRects(
      descendantRects,
      mapping,
    );

    if (descendantBounds) {
      return descendantBounds;
    }
  }

  let tagName = element.tagName.toLowerCase();
  let measuredElement: Element = element;

  // Heading/text nodes are wrapped in a plain <div> by the stage renderer.
  // When the wrapper div has a single child that is a text-bound element
  // (h1-h6, p, etc.), delegate measurement to that inner element so the
  // overlay tightly wraps the actual inline text content rather than the
  // full-width block wrapper.
  if (
    tagName === "div" &&
    element.children.length === 1 &&
    TEXT_BOUND_TAGS.has(element.children[0].tagName.toLowerCase())
  ) {
    measuredElement = element.children[0];
    tagName = measuredElement.tagName.toLowerCase();
  }

  const ownerDocument = measuredElement.ownerDocument;
  const hasTextContent = (measuredElement.textContent ?? "").trim().length > 0;

  if (TEXT_BOUND_TAGS.has(tagName) && hasTextContent) {
    const textNodes: Text[] = [];
    const collectTextNodes = (node: Node): void => {
      if (node.nodeType === 3) {
        const textNode = node as Text;
        if ((textNode.textContent ?? "").trim().length > 0) {
          textNodes.push(textNode);
        }
        return;
      }

      node.childNodes.forEach((child) => collectTextNodes(child));
    };

    collectTextNodes(measuredElement);

    const textRects = textNodes
      .flatMap((textNode) => {
        const range = ownerDocument.createRange();
        range.selectNodeContents(textNode);
        return Array.from(range.getClientRects());
      })
      .filter((entry) => entry.width > 0 && entry.height > 0);

    if (textRects.length > 0) {
      const minLeft = Math.min(...textRects.map((entry) => entry.left));
      const minTop = Math.min(...textRects.map((entry) => entry.top));
      const maxRight = Math.max(...textRects.map((entry) => entry.right));
      const maxBottom = Math.max(...textRects.map((entry) => entry.bottom));

      if (maxRight > minLeft && maxBottom > minTop) {
        return mapLocalOverlayToHostViewport(
          {
            left: minLeft,
            top: minTop,
            width: maxRight - minLeft,
            height: maxBottom - minTop,
          },
          mapping,
        );
      }
    }
  }

  // For elements with fluid width, try to find actual content bounds
  const computedStyle = (
    element.ownerDocument?.defaultView || window
  ).getComputedStyle(element);

  // If element claims 100% width but has narrower content, find actual content bounds
  if (
    !STRUCTURAL_BOX_NODE_TYPES.has(nodeType) &&
    computedStyle.width === "100%" &&
    element.children.length > 0
  ) {
    let minLeft = Infinity;
    let maxRight = -Infinity;
    let minTop = rect.top;
    let maxBottom = rect.bottom;

    // Check all child elements to find actual content bounds
    for (const child of element.children) {
      const childRect = (child as Element).getBoundingClientRect();
      minLeft = Math.min(minLeft, childRect.left);
      maxRight = Math.max(maxRight, childRect.right);
      minTop = Math.min(minTop, childRect.top);
      maxBottom = Math.max(maxBottom, childRect.bottom);
    }

    // If we found valid child bounds, use them
    if (minLeft !== Infinity && maxRight !== -Infinity) {
      return mapLocalOverlayToHostViewport(
        {
          left: minLeft,
          top: minTop,
          width: maxRight - minLeft,
          height: maxBottom - minTop,
        },
        mapping,
      );
    }
  }

  return mapLocalOverlayToHostViewport(
    {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
    mapping,
  );
}

function buildOverlayPositionFromRects(
  rects: DOMRect[],
  mapping: IframeViewportMapping,
): OverlayPosition | null {
  if (rects.length === 0) {
    return null;
  }

  const minLeft = Math.min(...rects.map((entry) => entry.left));
  const minTop = Math.min(...rects.map((entry) => entry.top));
  const maxRight = Math.max(...rects.map((entry) => entry.right));
  const maxBottom = Math.max(...rects.map((entry) => entry.bottom));

  if (maxRight <= minLeft || maxBottom <= minTop) {
    return null;
  }

  return mapLocalOverlayToHostViewport(
    {
      left: minLeft,
      top: minTop,
      width: maxRight - minLeft,
      height: maxBottom - minTop,
    },
    mapping,
  );
}

function isTransparentColor(color: string): boolean {
  const normalized = color.trim().toLowerCase();

  if (!normalized || normalized === "transparent") {
    return true;
  }

  if (normalized.startsWith("rgba(") || normalized.startsWith("hsla(")) {
    const parts = normalized.slice(normalized.indexOf("(") + 1, -1).split(",");
    const alpha = parts.at(-1)?.trim();

    return alpha === "0" || alpha === "0%" || alpha === "0.0";
  }

  return false;
}

function hasVisualDecoration(
  style: CSSStyleDeclaration,
  side: "top" | "right" | "bottom" | "left",
): boolean {
  const width = Number.parseFloat(
    style.getPropertyValue(`border-${side}-width`),
  );
  const borderStyle = style.getPropertyValue(`border-${side}-style`).trim();

  return Number.isFinite(width) && width > 0 && borderStyle !== "none";
}

function isVisuallyMeaningfulElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  const style = (element.ownerDocument?.defaultView || window).getComputedStyle(
    element,
  );

  if (CONTENTFUL_TAGS.has(tagName)) {
    return true;
  }

  if (
    TEXT_BOUND_TAGS.has(tagName) &&
    (element.textContent ?? "").trim().length > 0
  ) {
    return true;
  }

  if (!isTransparentColor(style.backgroundColor)) {
    return true;
  }

  if (style.backgroundImage && style.backgroundImage !== "none") {
    return true;
  }

  if (style.boxShadow && style.boxShadow !== "none") {
    return true;
  }

  if (
    hasVisualDecoration(style, "top") ||
    hasVisualDecoration(style, "right") ||
    hasVisualDecoration(style, "bottom") ||
    hasVisualDecoration(style, "left")
  ) {
    return true;
  }

  const outlineWidth = Number.parseFloat(style.outlineWidth);
  if (
    Number.isFinite(outlineWidth) &&
    outlineWidth > 0 &&
    style.outlineStyle !== "none"
  ) {
    return true;
  }

  return false;
}

function collectMeaningfulDescendantRects(root: Element): DOMRect[] {
  const rects: DOMRect[] = [];

  for (const child of root.children) {
    const childRect = child.getBoundingClientRect();

    if (childRect.width <= 0 && childRect.height <= 0) {
      continue;
    }

    if (child.children.length > 0 && !isVisuallyMeaningfulElement(child)) {
      const nestedRects = collectMeaningfulDescendantRects(child);

      if (nestedRects.length > 0) {
        rects.push(...nestedRects);
        continue;
      }
    }

    rects.push(childRect);
  }

  return rects;
}

function padOverlayPosition(
  position: OverlayPosition,
  padding: number,
): OverlayPosition {
  if (padding <= 0) {
    return position;
  }

  return {
    left: position.left - padding,
    top: position.top - padding,
    width: position.width + padding * 2,
    height: position.height + padding * 2,
  };
}

function shouldPadSelectionBounds(element: Element): boolean {
  return TEXT_BOUND_TAGS.has(element.tagName.toLowerCase());
}

function calculateSelectionPosition(
  element: Element,
  mapping: IframeViewportMapping,
): OverlayPosition {
  const position = calculatePosition(element, mapping);

  if (!shouldPadSelectionBounds(element)) {
    return position;
  }

  return padOverlayPosition(position, TEXT_SELECTION_PADDING_PX);
}

function resolveOverlayMeasurementTarget(
  element: Element,
  nodeType?: string,
): Element {
  if (
    !isValidElement(element) ||
    typeof element.tagName !== "string" ||
    typeof (element as ParentNode).querySelector !== "function"
  ) {
    return element;
  }

  const htmlElement = element as HTMLElement;

  const resolvedNodeType = (
    nodeType?.trim() ||
    element.getAttribute("data-aria-type") ||
    element.tagName
  ).toLowerCase();

  if (INLINE_TEXT_MEASUREMENT_NODE_TYPES.has(resolvedNodeType)) {
    const inlineTarget = getInlineEditableElement(
      htmlElement,
      resolvedNodeType,
    );
    if (inlineTarget && isValidElement(inlineTarget)) {
      return inlineTarget;
    }
  }

  const contentTarget = getContentStyleTargetElement(
    htmlElement,
    resolvedNodeType,
  );
  if (contentTarget && isValidElement(contentTarget)) {
    return contentTarget;
  }

  return element;
}

function captureRelativeOverlayBounds(element: Element): RelativeOverlayBounds {
  const elementRect = element.getBoundingClientRect();
  const measured = calculateSelectionPosition(element, {
    left: 0,
    top: 0,
    scaleX: 1,
    scaleY: 1,
  });

  return {
    leftInset: measured.left - elementRect.left,
    topInset: measured.top - elementRect.top,
    width: measured.width,
    height: measured.height,
  };
}

function calculateLockedPosition(
  element: Element,
  mapping: IframeViewportMapping,
  lockedBounds: RelativeOverlayBounds | null,
): OverlayPosition {
  if (!lockedBounds) {
    return calculatePosition(element, mapping);
  }

  const elementRect = element.getBoundingClientRect();

  return mapLocalOverlayToHostViewport(
    {
      left: elementRect.left + lockedBounds.leftInset,
      top: elementRect.top + lockedBounds.topInset,
      width: lockedBounds.width,
      height: lockedBounds.height,
    },
    mapping,
  );
}

function calculateDocumentLockedPosition(
  element: Element,
  lockedBounds: RelativeOverlayBounds | null,
): OverlayPosition {
  if (!lockedBounds) {
    const measured = calculateSelectionPosition(element, {
      left: 0,
      top: 0,
      scaleX: 1,
      scaleY: 1,
    });
    const view = element.ownerDocument.defaultView;

    return {
      left: measured.left + (view?.scrollX ?? 0),
      top: measured.top + (view?.scrollY ?? 0),
      width: measured.width,
      height: measured.height,
    };
  }

  const elementRect = element.getBoundingClientRect();
  const view = element.ownerDocument.defaultView;

  return {
    left: elementRect.left + lockedBounds.leftInset + (view?.scrollX ?? 0),
    top: elementRect.top + lockedBounds.topInset + (view?.scrollY ?? 0),
    width: lockedBounds.width,
    height: lockedBounds.height,
  };
}

function calculateDocumentPosition(element: Element): OverlayPosition {
  const measured = calculatePosition(element, {
    left: 0,
    top: 0,
    scaleX: 1,
    scaleY: 1,
  });
  const view = element.ownerDocument.defaultView;

  return {
    left: measured.left + (view?.scrollX ?? 0),
    top: measured.top + (view?.scrollY ?? 0),
    width: measured.width,
    height: measured.height,
  };
}

function resolveOverlayThemeColors(): OverlayThemeColors {
  const primary = resolveAdminPrimaryColor();

  return {
    border: primary,
    hoverBackground: `color-mix(in srgb, ${primary} 5%, transparent)`,
    hoverShadow: `0 0 0 1px color-mix(in srgb, ${primary} 20%, transparent)`,
    selectionBackground: "transparent",
    ghostBackground: `color-mix(in srgb, ${primary} 10%, transparent)`,
    ghostBorder: `color-mix(in srgb, ${primary} 40%, transparent)`,
  };
}

function applyIframeOverlayTheme(): void {
  const colors = resolveOverlayThemeColors();

  if (iframeHoverOverlayEl) {
    iframeHoverOverlayEl.style.border = `1px dashed ${colors.border}`;
    iframeHoverOverlayEl.style.background = colors.hoverBackground;
    iframeHoverOverlayEl.style.boxShadow = colors.hoverShadow;
  }

  if (iframeSelectionOverlayEl) {
    iframeSelectionOverlayEl.style.border = `2px solid ${colors.border}`;
    iframeSelectionOverlayEl.style.background = colors.selectionBackground;
  }

  for (const secondaryOverlayElement of iframeSecondarySelectionOverlayEls) {
    secondaryOverlayElement.style.border = `2px solid ${colors.border}`;
    secondaryOverlayElement.style.background = "transparent";
    secondaryOverlayElement.style.opacity = "0.55";
  }

  if (iframeSelectionGhostOverlayEl) {
    iframeSelectionGhostOverlayEl.style.border = `1px dashed ${colors.ghostBorder}`;
    iframeSelectionGhostOverlayEl.style.background = colors.ghostBackground;
  }
}

function syncHoverPosition(getOffset: () => IframeViewportMapping): void {
  if (
    !hoverState.visible ||
    !hoverState.element ||
    !isValidElement(hoverState.element)
  ) {
    return;
  }

  const offset = getOffset();
  renderHoverPosition(calculatePosition(hoverState.element, offset), false);
}

function syncSecondarySelectionPositions(mode: OverlayUpdateMode): void {
  const runtime = overlayRuntime;
  if (!runtime) {
    return;
  }

  const nextStates = secondarySelectionStates.filter((state) => {
    const contentDocument = runtime.iframeRef?.value?.contentDocument;
    const currentElement = state.element;

    let resolvedElement: Element | null = null;
    if (
      isValidElement(currentElement) &&
      currentElement.isConnected &&
      elementMatchesStageNodeId(currentElement, state.nodeId)
    ) {
      resolvedElement = currentElement;
    } else if (contentDocument) {
      const nextElement = findStageNodeElement(
        contentDocument,
        runtime.getBlocks?.() ?? [],
        state.nodeId,
        { preferredElement: currentElement },
      );

      if (isValidElement(nextElement)) {
        resolvedElement = resolveOverlayMeasurementTarget(
          nextElement,
          state.nodeType,
        );
      }
    }

    if (!resolvedElement) {
      return false;
    }

    state.element = resolvedElement;
    const offset = runtime.getOffset();
    const position =
      mode === "translate"
        ? calculateLockedPosition(resolvedElement, offset, state.lockedBounds)
        : (() => {
            state.lockedBounds = captureRelativeOverlayBounds(resolvedElement);
            return calculateLockedPosition(
              resolvedElement,
              offset,
              state.lockedBounds,
            );
          })();
    state.position = position;

    return true;
  });

  secondarySelectionStates.splice(
    0,
    secondarySelectionStates.length,
    ...nextStates,
  );
  renderSecondarySelectionPositions();
}

function remeasureSelectionPosition(
  element: Element,
  mapping: IframeViewportMapping,
): OverlayPosition {
  const lockedBounds = captureRelativeOverlayBounds(element);
  selectionState.lockedBounds = lockedBounds;
  return calculateLockedPosition(element, mapping, lockedBounds);
}

/**
 * Iframe overlays are absolutely positioned inside a dedicated root. That root
 * normally starts at the iframe document origin, but page layout.
 */
function mapIframeDocumentPositionToOverlayRoot(
  overlayElement: HTMLElement,
  position: OverlayPosition,
): OverlayPosition {
  const overlayRoot = overlayElement.closest<HTMLElement>(
    `[${IFRAME_OVERLAY_ROOT_ATTR}]`,
  );
  if (!overlayRoot) {
    return position;
  }

  const rootRect = overlayRoot.getBoundingClientRect();
  const view = overlayRoot.ownerDocument.defaultView;
  const rootDocumentLeft =
    rootRect.left + (view?.scrollX ?? 0) + overlayRoot.clientLeft;
  const rootDocumentTop =
    rootRect.top + (view?.scrollY ?? 0) + overlayRoot.clientTop;

  return {
    left: position.left - rootDocumentLeft,
    top: position.top - rootDocumentTop,
    width: position.width,
    height: position.height,
  };
}

function writeOverlayPosition(
  overlayElement: HTMLElement | null,
  position: OverlayPosition | null,
): void {
  if (!overlayElement) {
    return;
  }

  if (!position) {
    overlayElement.style.display = "none";
    overlayElement.style.transform = "";
    overlayElement.style.width = "";
    overlayElement.style.height = "";
    return;
  }

  const localPosition = mapIframeDocumentPositionToOverlayRoot(
    overlayElement,
    position,
  );

  overlayElement.style.display = "block";
  overlayElement.style.transform = `translate3d(${localPosition.left}px, ${localPosition.top}px, 0)`;
  overlayElement.style.width = `${localPosition.width}px`;
  overlayElement.style.height = `${localPosition.height}px`;
}

function writeIframeSelectionOverlay(position: OverlayPosition | null): void {
  writeOverlayPosition(iframeSelectionOverlayEl, position);
}

function renderHoverPosition(
  position: OverlayPosition | null,
  syncState: boolean,
): void {
  if (syncState) {
    hoverState.position = position;
  }

  if (
    position &&
    hoverState.visible &&
    hoverState.element &&
    isValidElement(hoverState.element)
  ) {
    applyIframeOverlayTheme();
    writeOverlayPosition(
      iframeHoverOverlayEl,
      calculateDocumentPosition(hoverState.element),
    );
    return;
  }

  writeOverlayPosition(iframeHoverOverlayEl, null);
}

function renderSelectionPosition(
  position: OverlayPosition | null,
  syncState: boolean,
): void {
  if (syncState) {
    selectionState.position = position;
  }

  if (
    position &&
    selectionState.visible &&
    selectionState.element &&
    isValidElement(selectionState.element)
  ) {
    applyIframeOverlayTheme();
    writeIframeSelectionOverlay(
      calculateDocumentLockedPosition(
        selectionState.element,
        selectionState.lockedBounds,
      ),
    );
    return;
  }

  writeIframeSelectionOverlay(null);
}

function renderSelectionGhostPosition(position: OverlayPosition | null): void {
  selectionGhostState.position = position;
  selectionGhostState.visible = Boolean(position);

  if (position) {
    applyIframeOverlayTheme();
    writeOverlayPosition(iframeSelectionGhostOverlayEl, position);
    return;
  }

  writeOverlayPosition(iframeSelectionGhostOverlayEl, null);
}

function ensureSecondarySelectionOverlays(count: number): void {
  const contentDocument = iframeSelectionOverlayEl?.ownerDocument;
  if (!contentDocument) {
    iframeSecondarySelectionOverlayEls = [];
    return;
  }

  const overlayRoot = ensureIframeOverlayRoot(contentDocument);

  while (iframeSecondarySelectionOverlayEls.length < count) {
    const overlayElement = contentDocument.createElement("div");
    overlayElement.setAttribute(
      "data-aria-secondary-selection-overlay",
      "true",
    );
    overlayElement.setAttribute("aria-hidden", "true");
    Object.assign(overlayElement.style, {
      position: "absolute",
      left: "0",
      top: "0",
      display: "none",
      pointerEvents: "none",
      zIndex: String(IFRAME_Z_INDEX.secondary),
      boxSizing: "border-box",
      willChange: "transform",
    } satisfies Partial<CSSStyleDeclaration>);
    overlayRoot.appendChild(overlayElement);
    iframeSecondarySelectionOverlayEls.push(overlayElement);
  }

  while (iframeSecondarySelectionOverlayEls.length > count) {
    const overlayElement = iframeSecondarySelectionOverlayEls.pop();
    overlayElement?.remove();
  }

  applyIframeOverlayTheme();
}

function renderSecondarySelectionPositions(): void {
  ensureSecondarySelectionOverlays(secondarySelectionStates.length);

  secondarySelectionStates.forEach((state, index) => {
    const overlayElement = iframeSecondarySelectionOverlayEls[index] ?? null;
    if (!overlayElement) {
      return;
    }

    if (state.position && state.element && isValidElement(state.element)) {
      writeOverlayPosition(
        overlayElement,
        calculateDocumentLockedPosition(state.element, state.lockedBounds),
      );
      return;
    }

    writeOverlayPosition(overlayElement, null);
  });
}

function ensureIframeOverlayRoot(contentDocument: Document): HTMLElement {
  const existingRoot = contentDocument.body?.querySelector<HTMLElement>(
    `[${IFRAME_OVERLAY_ROOT_ATTR}]`,
  );

  if (existingRoot) {
    return existingRoot;
  }

  const overlayRoot = contentDocument.createElement("div");
  overlayRoot.setAttribute(IFRAME_OVERLAY_ROOT_ATTR, "true");
  Object.assign(overlayRoot.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    zIndex: String(IFRAME_Z_INDEX.overlay),
  } satisfies Partial<CSSStyleDeclaration>);

  (contentDocument.body ?? contentDocument.documentElement).appendChild(
    overlayRoot,
  );

  return overlayRoot;
}

function ensureIframeSelectionOverlay(contentDocument: Document): void {
  if (
    iframeHoverOverlayEl?.ownerDocument === contentDocument &&
    iframeSelectionOverlayEl?.ownerDocument === contentDocument
  ) {
    return;
  }

  iframeHoverOverlayEl?.remove();
  iframeSelectionOverlayEl?.remove();
  iframeSelectionGhostOverlayEl?.remove();
  iframeSecondarySelectionOverlayEls.forEach((overlayElement) =>
    overlayElement.remove(),
  );
  iframeSecondarySelectionOverlayEls = [];
  const overlayRoot = ensureIframeOverlayRoot(contentDocument);

  const hoverElement = contentDocument.createElement("div");
  hoverElement.setAttribute("data-aria-hover-overlay", "true");
  hoverElement.setAttribute("aria-hidden", "true");
  Object.assign(hoverElement.style, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    pointerEvents: "none",
    zIndex: String(IFRAME_Z_INDEX.overlay),
    boxSizing: "border-box",
    willChange: "transform",
  } satisfies Partial<CSSStyleDeclaration>);
  overlayRoot.appendChild(hoverElement);
  iframeHoverOverlayEl = hoverElement;

  const overlayElement = contentDocument.createElement("div");
  overlayElement.setAttribute("data-aria-selection-overlay", "true");
  overlayElement.setAttribute("aria-hidden", "true");
  Object.assign(overlayElement.style, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    pointerEvents: "none",
    zIndex: String(IFRAME_Z_INDEX.overlay),
    boxSizing: "border-box",
    willChange: "transform",
  } satisfies Partial<CSSStyleDeclaration>);

  overlayRoot.appendChild(overlayElement);
  iframeSelectionOverlayEl = overlayElement;

  const ghostOverlayElement = contentDocument.createElement("div");
  ghostOverlayElement.setAttribute("data-aria-selection-ghost-overlay", "true");
  ghostOverlayElement.setAttribute("aria-hidden", "true");
  Object.assign(ghostOverlayElement.style, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    pointerEvents: "none",
    zIndex: String(IFRAME_Z_INDEX.secondary),
    boxSizing: "border-box",
    willChange: "transform",
  } satisfies Partial<CSSStyleDeclaration>);

  overlayRoot.appendChild(ghostOverlayElement);
  iframeSelectionGhostOverlayEl = ghostOverlayElement;

  applyIframeOverlayTheme();

  renderHoverPosition(hoverState.visible ? hoverState.position : null, false);
  renderSelectionPosition(
    selectionState.visible ? selectionState.position : null,
    false,
  );
  renderSelectionGhostPosition(
    selectionGhostState.visible ? selectionGhostState.position : null,
  );
  renderSecondarySelectionPositions();
}

/**
 * Check if element is valid (handles cross-frame elements)
 */
function isValidElement(element: unknown): element is Element {
  return (
    element != null &&
    typeof element === "object" &&
    "getBoundingClientRect" in element &&
    typeof (element as Element).getBoundingClientRect === "function" &&
    "nodeType" in element &&
    (element as unknown as Node).nodeType === 1
  );
}

function createSvgIcon(paths: string, size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/**
 * Throttle function for signal emission
 */
function shouldEmitHoverSignal(): boolean {
  const now = Date.now();
  if (now - lastHoverSignalTime >= HOVER_SIGNAL_THROTTLE_MS) {
    lastHoverSignalTime = now;
    return true;
  }
  return false;
}

export interface UseCanvasOverlaysOptions {
  iframeRef?: Ref<HTMLIFrameElement | null>;
  debug?: boolean;
  /** Accessor for the current stage block tree when disambiguating duplicate DOM IDs */
  getBlocks?: () => BuilderNode[];
}

export interface UseCanvasOverlaysReturn {
  // State (readonly)
  hover: Readonly<HoverState>;
  selection: Readonly<SelectionState>;
  secondarySelections: Readonly<SecondarySelectionState[]>;
  insertion: Readonly<InsertionState>;
  dropZones: Readonly<DropZoneState>;
  addElementsDrop: Readonly<AddElementsDropState>;
  affordances: Readonly<CanvasAffordanceDescriptor[]>;

  showHover: (
    element: Element,
    nodeId: string,
    options?: OverlaySignalOptions,
  ) => void;
  hideHover: () => void;

  showSelection: (
    element: Element,
    nodeId: string,
    nodeType?: string,
    options?: OverlaySignalOptions,
  ) => void;
  hideSelection: () => void;
  showSecondarySelections: (targets: OverlaySelectionTarget[]) => void;
  hideSecondarySelections: () => void;
  showSelectionGhost: (element: Element, nodeType?: string) => void;
  hideSelectionGhost: () => void;
  updateSelectionPosition: () => void;

  showInsertion: (
    position: OverlayPosition,
    orientation?: "horizontal" | "vertical",
  ) => void;
  showFrameInsertion: (
    position: OverlayPosition,
    orientation?: "horizontal" | "vertical",
  ) => void;
  hideInsertion: () => void;
  showAddElementsDropFeedback: (
    placeholder: OverlayPosition,
    target?: OverlayPosition | null,
    orientation?: "horizontal" | "vertical",
  ) => void;
  hideAddElementsDropFeedback: () => void;
  showFrameAffordances: (
    descriptors: readonly CanvasAffordanceDescriptor[],
  ) => void;
  hideAffordances: () => void;

  showDropZones: (
    zones: Array<{ id: string; position: OverlayPosition }>,
  ) => void;
  activateDropZone: (zoneId: string) => void;
  hideDropZones: () => void;

  // Position updates (RAF-batched)
  schedulePositionUpdate: (mode?: OverlayUpdateMode) => void;

  cleanup: () => void;

  onToolbarAction: (
    callback: (action: ToolbarActionName, nodeId: string) => void,
  ) => () => void;
}

/**
 * Unified canvas overlays composable
 *
 * @example
 * ```vue
 * <script setup>
 * const overlays = useCanvasOverlays({ iframeRef });
 *
 * // On mousemove in iframe
 * function handleMouseMove(element: Element, nodeId: string) {
 *   overlays.showHover(element, nodeId);
 * }
 *
 * // On click in iframe
 * function handleClick(element: Element, nodeId: string, nodeType: string) {
 *   overlays.hideHover();
 *   overlays.showSelection(element, nodeId, nodeType);
 * }
 * </script>
 * ```
 */
export function useCanvasOverlays(
  options: UseCanvasOverlaysOptions = {},
): UseCanvasOverlaysReturn {
  const { iframeRef, debug = false } = options;
  const { broadcastHoverNode, broadcastSelectNode } =
    useCanvasInteractionBridge();

  const toolbarCallbacks = new Set<
    (action: ToolbarActionName, nodeId: string) => void
  >();

  const getOffset = (): IframeViewportMapping => {
    return getIframeViewportMapping(iframeRef?.value ?? null);
  };

  overlayRuntime = {
    iframeRef,
    getBlocks: options.getBlocks,
    getOffset,
  };

  const resolveSelectionElement = (): Element | null => {
    const currentElement = selectionState.element;

    if (
      isValidElement(currentElement) &&
      currentElement.isConnected &&
      elementMatchesStageNodeId(currentElement, selectionState.nodeId ?? "")
    ) {
      return currentElement;
    }

    const nodeId = selectionState.nodeId;
    const contentDocument = iframeRef?.value?.contentDocument;
    if (!nodeId || !contentDocument) {
      return null;
    }

    const nextElement = findStageNodeElement(
      contentDocument,
      options.getBlocks?.() ?? [],
      nodeId,
      { preferredElement: currentElement },
    );
    if (!isValidElement(nextElement)) {
      return null;
    }

    const measurementTarget = resolveOverlayMeasurementTarget(
      nextElement,
      selectionState.nodeType,
    );

    selectionState.element = measurementTarget;
    selectionState.hasParent = Boolean(
      (nextElement as HTMLElement).parentElement?.closest(
        "[data-aria-id], [data-aria-template-id]",
      ),
    );

    return measurementTarget;
  };

  const syncSelectionPosition = (mode: OverlayUpdateMode): void => {
    if (!selectionState.visible) {
      return;
    }

    const element = resolveSelectionElement();
    if (!element) {
      hideSelection();
      return;
    }

    const offset = getOffset();
    const position =
      mode === "translate"
        ? calculateLockedPosition(element, offset, selectionState.lockedBounds)
        : remeasureSelectionPosition(element, offset);

    renderSelectionPosition(position, true);
  };

  function showHover(
    element: Element,
    nodeId: string,
    options: OverlaySignalOptions = {},
  ): void {
    if (!isValidElement(element)) {
      if (debug) console.warn("[useCanvasOverlays] Invalid element for hover");
      return;
    }

    const { emitSignal = true } = options;
    const measurementTarget = resolveOverlayMeasurementTarget(element);

    const offset = getOffset();
    const position = calculatePosition(measurementTarget, offset);

    hoverState.visible = true;
    hoverState.nodeId = nodeId;
    hoverState.element = measurementTarget;
    renderHoverPosition(position, true);

    // Throttled signal for Layers panel
    if (emitSignal && shouldEmitHoverSignal()) {
      broadcastHoverNode({ nodeId });
    }

    if (debug) {
      console.debug("[useCanvasOverlays] Hover shown:", { nodeId, position });
    }
  }

  function hideHover(): void {
    if (!hoverState.visible) return;

    hoverState.visible = false;
    hoverState.nodeId = null;
    hoverState.element = null;
    renderHoverPosition(null, true);

    // Always broadcast hide (not throttled)
    broadcastHoverNode({ nodeId: null });

    if (debug) {
      console.debug("[useCanvasOverlays] Hover hidden");
    }
  }

  function showSelection(
    element: Element,
    nodeId: string,
    nodeType = "div",
    options: OverlaySignalOptions = {},
  ): void {
    if (!isValidElement(element)) {
      if (debug)
        console.warn("[useCanvasOverlays] Invalid element for selection");
      return;
    }

    const { emitSignal = true } = options;
    const measurementTarget = resolveOverlayMeasurementTarget(
      element,
      nodeType,
    );

    const offset = getOffset();
    const position = remeasureSelectionPosition(measurementTarget, offset);

    const hasParent = Boolean(
      element.parentElement?.closest("[data-aria-id], [data-aria-template-id]"),
    );
    const isComponent = nodeType === "Component";

    selectionState.visible = true;
    selectionState.nodeId = nodeId;
    selectionState.nodeType = nodeType;
    selectionState.element = measurementTarget;
    renderSelectionPosition(position, true);
    selectionState.hasParent = hasParent;
    selectionState.isComponent = isComponent;

    // Broadcast selection (not throttled - semantic event)
    if (emitSignal) {
      broadcastSelectNode({
        nodeId,
        triggerGesture: options.triggerGesture,
      });
    }

    if (debug) {
      console.debug("[useCanvasOverlays] Selection shown:", {
        nodeId,
        nodeType,
        position,
      });
    }
  }

  function hideSelection(): void {
    if (!selectionState.visible) return;

    selectionState.visible = false;
    selectionState.nodeId = null;
    selectionState.nodeType = "div";
    selectionState.element = null;
    renderSelectionPosition(null, true);
    selectionState.lockedBounds = null;
    selectionState.hasParent = false;
    selectionState.isComponent = false;
    hideSelectionGhost();

    if (debug) {
      console.debug("[useCanvasOverlays] Selection hidden");
    }
  }

  function showSecondarySelections(targets: OverlaySelectionTarget[]): void {
    const offset = getOffset();
    const nextStates = targets
      .filter((target) => isValidElement(target.element))
      .map((target) => {
        const measurementTarget = resolveOverlayMeasurementTarget(
          target.element,
          target.nodeType,
        );
        const lockedBounds = captureRelativeOverlayBounds(measurementTarget);

        return {
          nodeId: target.nodeId,
          nodeType: target.nodeType ?? "div",
          element: measurementTarget,
          lockedBounds,
          position: calculateLockedPosition(
            measurementTarget,
            offset,
            lockedBounds,
          ),
        } satisfies SecondarySelectionState;
      });

    secondarySelectionStates.splice(
      0,
      secondarySelectionStates.length,
      ...nextStates,
    );
    renderSecondarySelectionPositions();
  }

  function hideSecondarySelections(): void {
    secondarySelectionStates.splice(0, secondarySelectionStates.length);
    renderSecondarySelectionPositions();
  }

  function showSelectionGhost(element: Element, nodeType = "div"): void {
    if (!isValidElement(element)) {
      return;
    }

    const measurementTarget = resolveOverlayMeasurementTarget(
      element,
      nodeType,
    );
    const lockedBounds = captureRelativeOverlayBounds(measurementTarget);
    renderSelectionGhostPosition(
      calculateDocumentLockedPosition(measurementTarget, lockedBounds),
    );
  }

  function hideSelectionGhost(): void {
    renderSelectionGhostPosition(null);
  }

  function updateSelectionPosition(): void {
    syncSelectionPosition("measure");
    syncSecondarySelectionPositions("measure");
  }

  function showInsertion(
    position: OverlayPosition,
    orientation: "horizontal" | "vertical" = "horizontal",
  ): void {
    insertionState.visible = true;
    insertionState.position = position;
    insertionState.orientation = orientation;

    if (debug) {
      console.debug("[useCanvasOverlays] Insertion shown:", {
        position,
        orientation,
      });
    }
  }

  function showFrameInsertion(
    position: OverlayPosition,
    orientation: "horizontal" | "vertical" = "horizontal",
  ): void {
    showInsertion(
      mapLocalOverlayToHostViewport(position, getOffset()),
      orientation,
    );
  }

  function hideInsertion(): void {
    insertionState.visible = false;
    insertionState.position = null;

    if (debug) {
      console.debug("[useCanvasOverlays] Insertion hidden");
    }
  }

  function showAddElementsDropFeedback(
    placeholder: OverlayPosition,
    target: OverlayPosition | null = null,
    orientation: "horizontal" | "vertical" = "vertical",
  ): void {
    const mapping = getOffset();
    addElementsDropState.visible = true;
    addElementsDropState.placeholder = mapLocalOverlayToHostViewport(
      placeholder,
      mapping,
    );
    addElementsDropState.target = target
      ? mapLocalOverlayToHostViewport(target, mapping)
      : null;
    addElementsDropState.orientation = orientation;
  }

  function hideAddElementsDropFeedback(): void {
    addElementsDropState.visible = false;
    addElementsDropState.placeholder = null;
    addElementsDropState.target = null;
  }

  function showFrameAffordances(
    descriptors: readonly CanvasAffordanceDescriptor[],
  ): void {
    const contentWindow = iframeRef?.value?.contentWindow;
    frameAffordanceDescriptors = descriptors.map((descriptor) => ({
      ...descriptor,
      position: { ...descriptor.position },
    }));
    frameAffordanceCaptureScroll = {
      left: contentWindow?.scrollX ?? 0,
      top: contentWindow?.scrollY ?? 0,
    };
    syncFrameAffordancePositions();
  }

  function syncFrameAffordancePositions(): void {
    const mapping = getOffset();
    const contentWindow = iframeRef?.value?.contentWindow;
    const scrollDeltaLeft =
      (contentWindow?.scrollX ?? 0) - frameAffordanceCaptureScroll.left;
    const scrollDeltaTop =
      (contentWindow?.scrollY ?? 0) - frameAffordanceCaptureScroll.top;

    canvasAffordanceState.splice(
      0,
      canvasAffordanceState.length,
      ...frameAffordanceDescriptors.map((descriptor) => ({
        ...descriptor,
        position: mapLocalOverlayToHostViewport(
          {
            ...descriptor.position,
            left: descriptor.position.left - scrollDeltaLeft,
            top: descriptor.position.top - scrollDeltaTop,
          },
          mapping,
        ),
      })),
    );
  }

  function hideAffordances(): void {
    frameAffordanceDescriptors = [];
    frameAffordanceCaptureScroll = { left: 0, top: 0 };
    canvasAffordanceState.splice(0, canvasAffordanceState.length);
  }

  function showDropZones(
    zones: Array<{ id: string; position: OverlayPosition }>,
  ): void {
    dropZoneState.visible = true;
    dropZoneState.zones = zones.map((z) => ({ ...z, isActive: false }));

    if (debug) {
      console.debug("[useCanvasOverlays] Drop zones shown:", zones.length);
    }
  }

  function activateDropZone(zoneId: string): void {
    for (const zone of dropZoneState.zones) {
      zone.isActive = zone.id === zoneId;
    }
  }

  function hideDropZones(): void {
    dropZoneState.visible = false;
    dropZoneState.zones = [];

    if (debug) {
      console.debug("[useCanvasOverlays] Drop zones hidden");
    }
  }

  function schedulePositionUpdate(mode: OverlayUpdateMode = "measure"): void {
    if (rafId !== null) return;

    rafId = requestAnimationFrame(() => {
      rafId = null;
      syncFrameAffordancePositions();

      if (mode === "translate") {
        syncHoverPosition(getOffset);
        syncSelectionPosition("translate");
        syncSecondarySelectionPositions("translate");
        return;
      }

      syncHoverPosition(getOffset);
      syncSelectionPosition("measure");
      syncSecondarySelectionPositions("measure");
    });
  }

  registerCanvasOverlayPositionScheduler(schedulePositionUpdate);

  // Watch iframe for scroll events and update selection position immediately (no throttle)
  watch(
    () => iframeRef?.value,
    (newFrame, _previousFrame, onCleanup) => {
      if (newFrame) {
        let detachFrameListeners: (() => void) | null = null;

        const followScroll = () => {
          syncSelectionPosition("translate");
          syncHoverPosition(getOffset);

          if (Date.now() - lastScrollActivityTime < SCROLL_FOLLOW_SETTLE_MS) {
            scrollFollowRafId = requestAnimationFrame(followScroll);
            return;
          }

          scrollFollowRafId = null;
        };

        const startScrollFollow = () => {
          lastScrollActivityTime = Date.now();
          syncSelectionPosition("translate");
          syncHoverPosition(getOffset);
          syncFrameAffordancePositions();

          if (scrollFollowRafId === null) {
            scrollFollowRafId = requestAnimationFrame(followScroll);
          }
        };

        const handleScroll = () => {
          startScrollFollow();
        };

        const handleScrollGesture = () => {
          startScrollFollow();
        };

        const handleResize = () => {
          schedulePositionUpdate("measure");
        };

        const attachFrameListeners = () => {
          const contentDocument = newFrame.contentDocument;
          const contentWindow = newFrame.contentWindow;

          if (!contentDocument) {
            return;
          }

          detachFrameListeners?.();
          ensureIframeSelectionOverlay(contentDocument);

          const resizeObserver =
            typeof ResizeObserver !== "undefined"
              ? new ResizeObserver(() => {
                  schedulePositionUpdate("measure");
                })
              : null;

          resizeObserver?.observe(newFrame);
          if (contentDocument.documentElement) {
            resizeObserver?.observe(contentDocument.documentElement);
          }
          if (contentDocument.body) {
            resizeObserver?.observe(contentDocument.body);
          }

          window.addEventListener("resize", handleResize, { passive: true });

          contentDocument.addEventListener("scroll", handleScroll, {
            capture: true,
            passive: true,
          });
          contentDocument.addEventListener("wheel", handleScrollGesture, {
            capture: true,
            passive: true,
          });
          contentDocument.addEventListener("touchmove", handleScrollGesture, {
            capture: true,
            passive: true,
          });
          contentWindow?.addEventListener("scroll", handleScroll, {
            passive: true,
          });

          detachFrameListeners = () => {
            writeOverlayPosition(iframeHoverOverlayEl, null);
            writeOverlayPosition(iframeSelectionOverlayEl, null);
            contentDocument.removeEventListener("scroll", handleScroll, {
              capture: true,
            });
            contentDocument.removeEventListener("wheel", handleScrollGesture, {
              capture: true,
            });
            contentDocument.removeEventListener(
              "touchmove",
              handleScrollGesture,
              {
                capture: true,
              },
            );
            contentWindow?.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleResize);
            resizeObserver?.disconnect();

            if (scrollFollowRafId !== null) {
              cancelAnimationFrame(scrollFollowRafId);
              scrollFollowRafId = null;
            }

            if (iframeSelectionOverlayEl?.ownerDocument === contentDocument) {
              iframeSelectionOverlayEl.remove();
              iframeSelectionOverlayEl = null;
            }
            iframeSecondarySelectionOverlayEls.forEach((overlayElement) => {
              if (overlayElement.ownerDocument === contentDocument) {
                overlayElement.remove();
              }
            });
            iframeSecondarySelectionOverlayEls = [];
            if (
              iframeSelectionGhostOverlayEl?.ownerDocument === contentDocument
            ) {
              iframeSelectionGhostOverlayEl.remove();
              iframeSelectionGhostOverlayEl = null;
            }
            if (iframeHoverOverlayEl?.ownerDocument === contentDocument) {
              iframeHoverOverlayEl.remove();
              iframeHoverOverlayEl = null;
            }
          };
        };

        const handleFrameLoad = () => {
          attachFrameListeners();
          schedulePositionUpdate("measure");
        };

        attachFrameListeners();
        newFrame.addEventListener("load", handleFrameLoad);

        onCleanup(() => {
          newFrame.removeEventListener("load", handleFrameLoad);
          detachFrameListeners?.();
          detachFrameListeners = null;
        });
      }
    },
    { immediate: true },
  );

  function cleanup(): void {
    overlayRuntime = null;
    unregisterCanvasOverlayPositionScheduler();

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (scrollFollowRafId !== null) {
      cancelAnimationFrame(scrollFollowRafId);
      scrollFollowRafId = null;
    }

    hideHover();
    hideSelection();
    hideSecondarySelections();
    hideInsertion();
    hideAddElementsDropFeedback();
    hideAffordances();
    hideDropZones();
    toolbarCallbacks.clear();

    if (debug) {
      console.debug("[useCanvasOverlays] Cleanup complete");
    }
  }

  function onToolbarAction(
    callback: (action: ToolbarActionName, nodeId: string) => void,
  ): () => void {
    toolbarCallbacks.add(callback);
    return () => toolbarCallbacks.delete(callback);
  }

  // Auto-cleanup on unmount

  onUnmounted(cleanup);

  return {
    // State (reactive, readonly externally)
    hover: hoverState,
    selection: selectionState,
    secondarySelections: secondarySelectionStates,
    insertion: insertionState,
    dropZones: dropZoneState,
    addElementsDrop: addElementsDropState,
    affordances: canvasAffordanceState,

    showHover,
    hideHover,

    showSelection,
    hideSelection,
    showSecondarySelections,
    hideSecondarySelections,
    showSelectionGhost,
    hideSelectionGhost,
    updateSelectionPosition,

    showInsertion,
    showFrameInsertion,
    hideInsertion,
    showAddElementsDropFeedback,
    hideAddElementsDropFeedback,
    showFrameAffordances,
    hideAffordances,

    showDropZones,
    activateDropZone,
    hideDropZones,

    schedulePositionUpdate,

    cleanup,

    onToolbarAction,
  };
}

export { Z_INDEX, IFRAME_Z_INDEX, ICON_MAP, TOOLBAR_ICONS, createSvgIcon };

// LIGHT SUBSCRIPTION (like useBeacon's onFocusChange)

/**
 * Subscribe to selection changes without full composable
 */
export function onSelectionChange(
  callback: (nodeId: string | null, nodeType: string) => void,
): () => void {
  const unwatch = watch(
    () => selectionState.nodeId,
    (nodeId) => {
      callback(nodeId, selectionState.nodeType);
    },
    { immediate: true },
  );

  return unwatch;
}

/**
 * Subscribe to hover changes without full composable
 */
export function onHoverChange(
  callback: (nodeId: string | null) => void,
): () => void {
  const unwatch = watch(
    () => hoverState.nodeId,
    (nodeId) => {
      callback(nodeId);
    },
    { immediate: true },
  );

  return unwatch;
}

export function getSelectionSnapshot(): SelectionState {
  return { ...selectionState };
}

export function getHoverSnapshot(): HoverState {
  return { ...hoverState };
}

export { refreshCanvasOverlayPositions } from "./canvasOverlayRefresh";
