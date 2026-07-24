import { IFRAME_Z_INDEX } from "@/lib/zIndex";
import { resolveAdminPrimaryColor } from "../styles/stageDropFeedback";
import { STAGE_OVERLAY_ROOT_ATTR } from "../composables/useIframeSetup";
import {
  frameViewportRectToIframeDocument,
  getIframeScroll,
  type IframeDocumentRect,
} from "./geometry";
import type { VisualOverlayDescriptor } from "./overlayDescriptors";

export const INTERACTION_OVERLAY_ATTR = "data-aria-interaction-overlay";
export const INTERACTION_OVERLAY_ID_ATTR = "data-aria-interaction-overlay-id";

export interface IframeOverlayRenderer {
  render: (descriptors: readonly VisualOverlayDescriptor[]) => void;
  flush: () => void;
  clear: () => void;
  destroy: () => void;
}

export interface IframeOverlayRendererOptions {
  iframe: HTMLIFrameElement;
  resolvePrimaryColor?: () => string;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

function getOverlayRoot(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`[${STAGE_OVERLAY_ROOT_ATTR}]`);
}

function createOverlayElement(
  doc: Document,
  descriptor: VisualOverlayDescriptor,
): HTMLElement {
  const element = doc.createElement("div");
  element.setAttribute(INTERACTION_OVERLAY_ATTR, "true");
  element.setAttribute(INTERACTION_OVERLAY_ID_ATTR, descriptor.id);
  element.setAttribute("aria-hidden", "true");
  Object.assign(element.style, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    pointerEvents: "none",
    boxSizing: "border-box",
    willChange: "transform,width,height",
    zIndex: String(IFRAME_Z_INDEX.overlay),
  } satisfies Partial<CSSStyleDeclaration>);
  return element;
}

function writeRect(element: HTMLElement, rect: IframeDocumentRect): void {
  element.style.display = "block";
  element.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

function applyDescriptorStyle(
  element: HTMLElement,
  descriptor: VisualOverlayDescriptor,
  primary: string,
): void {
  element.dataset.overlayKind = descriptor.kind;
  element.dataset.overlayVariant = descriptor.variant;

  element.style.background = "transparent";
  element.style.borderRadius = "0";
  element.style.boxShadow = "";
  element.style.opacity = "1";
  element.style.border = "0";
  element.style.zIndex = String(IFRAME_Z_INDEX.overlay);

  if (descriptor.kind === "hover") {
    element.style.border = `1px dashed ${primary}`;
    element.style.background = `color-mix(in srgb, ${primary} 5%, transparent)`;
    element.style.boxShadow = `0 0 0 1px color-mix(in srgb, ${primary} 20%, transparent)`;
    return;
  }

  if (descriptor.kind === "selection") {
    element.style.border =
      descriptor.variant === "ghost"
        ? `1px dashed color-mix(in srgb, ${primary} 40%, transparent)`
        : `2px solid ${primary}`;
    element.style.background =
      descriptor.variant === "ghost"
        ? `color-mix(in srgb, ${primary} 10%, transparent)`
        : "transparent";
    element.style.opacity = descriptor.variant === "secondary" ? "0.55" : "1";
    element.style.zIndex = String(IFRAME_Z_INDEX.insertion);
    return;
  }

  if (descriptor.kind === "insertion") {
    element.style.background = primary;
    element.style.borderRadius = "2px";
    element.style.boxShadow = `0 0 4px color-mix(in srgb, ${primary} 35%, transparent)`;
    element.style.zIndex = String(IFRAME_Z_INDEX.insertion);
    return;
  }

  element.style.border = `2px dashed color-mix(in srgb, ${primary} 70%, transparent)`;
}

export function createIframeOverlayRenderer({
  iframe,
  resolvePrimaryColor = resolveAdminPrimaryColor,
  requestFrame = (callback) => window.requestAnimationFrame(callback),
  cancelFrame = (handle) => window.cancelAnimationFrame(handle),
}: IframeOverlayRendererOptions): IframeOverlayRenderer {
  const elements = new Map<string, HTMLElement>();
  let pendingDescriptors: readonly VisualOverlayDescriptor[] = [];
  let frameHandle: number | null = null;

  function ensureElement(
    root: HTMLElement,
    descriptor: VisualOverlayDescriptor,
  ): HTMLElement {
    const existing = elements.get(descriptor.id);
    if (existing?.ownerDocument === root.ownerDocument && existing.isConnected) {
      return existing;
    }

    existing?.remove();
    const element = createOverlayElement(root.ownerDocument, descriptor);
    root.appendChild(element);
    elements.set(descriptor.id, element);
    return element;
  }

  function removeStale(activeIds: Set<string>): void {
    for (const [id, element] of elements) {
      if (!activeIds.has(id)) {
        element.remove();
        elements.delete(id);
      }
    }
  }

  function flush(): void {
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }

    const doc = iframe.contentDocument;
    if (!doc) {
      clear();
      return;
    }

    const root = getOverlayRoot(doc);
    if (!root) {
      clear();
      return;
    }

    root.style.pointerEvents = "none";
    const activeIds = new Set(pendingDescriptors.map((entry) => entry.id));
    const primary = resolvePrimaryColor();
    const scroll = getIframeScroll(iframe);

    removeStale(activeIds);

    for (const descriptor of pendingDescriptors) {
      const element = ensureElement(root, descriptor);
      const documentRect = frameViewportRectToIframeDocument(
        descriptor.rect,
        scroll,
      );
      applyDescriptorStyle(element, descriptor, primary);
      writeRect(element, documentRect);
    }
  }

  function schedule(): void {
    if (frameHandle !== null) {
      return;
    }
    frameHandle = requestFrame(() => {
      frameHandle = null;
      flush();
    });
  }

  function render(descriptors: readonly VisualOverlayDescriptor[]): void {
    pendingDescriptors = descriptors;
    schedule();
  }

  function clear(): void {
    pendingDescriptors = [];
    for (const element of elements.values()) {
      element.remove();
    }
    elements.clear();
  }

  function destroy(): void {
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    clear();
  }

  return {
    render,
    flush,
    clear,
    destroy,
  };
}
