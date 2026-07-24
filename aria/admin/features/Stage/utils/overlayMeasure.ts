/**
 * Shared element measurement for canvas overlays (selection, drop feedback).
 * Matches the tight content bounds logic in useCanvasOverlays.
 */

import type { ViewportRect } from "../dragdrop/canvasDropInsertion";

const TEXT_BOUND_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "a",
  "label",
  "strong",
  "em",
  "small",
  "blockquote",
  "li",
]);

function rectToViewport(rect: DOMRect): ViewportRect {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function unionViewportRects(rects: readonly ViewportRect[]): ViewportRect | null {
  if (rects.length === 0) {
    return null;
  }

  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;

  for (const rect of rects) {
    minLeft = Math.min(minLeft, rect.left);
    minTop = Math.min(minTop, rect.top);
    maxRight = Math.max(maxRight, rect.left + rect.width);
    maxBottom = Math.max(maxBottom, rect.top + rect.height);
  }

  return {
    left: minLeft,
    top: minTop,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  };
}

/**
 * Viewport-space bounds for an element, preferring tight text/content boxes.
 */
export function measureElementViewportRect(element: Element): ViewportRect {
  const rect = element.getBoundingClientRect();
  let tagName = element.tagName.toLowerCase();
  let measuredElement: Element = element;

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

  if (TEXT_BOUND_TAGS.has(tagName) && hasTextContent && ownerDocument) {
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
        return {
          left: minLeft,
          top: minTop,
          width: maxRight - minLeft,
          height: maxBottom - minTop,
        };
      }
    }
  }

  const view = element.ownerDocument?.defaultView ?? window;
  const computedStyle = view.getComputedStyle(element);

  if (computedStyle.width === "100%" && element.children.length > 0) {
    let minLeft = Infinity;
    let maxRight = -Infinity;
    let minTop = rect.top;
    let maxBottom = rect.bottom;

    for (const child of element.children) {
      const childRect = (child as Element).getBoundingClientRect();
      minLeft = Math.min(minLeft, childRect.left);
      maxRight = Math.max(maxRight, childRect.right);
      minTop = Math.min(minTop, childRect.top);
      maxBottom = Math.max(maxBottom, childRect.bottom);
    }

    if (minLeft !== Infinity && maxRight !== -Infinity) {
      return {
        left: minLeft,
        top: minTop,
        width: maxRight - minLeft,
        height: maxBottom - minTop,
      };
    }
  }

  return rectToViewport(rect);
}

export function measureChildrenUnionViewportRect(
  children: readonly HTMLElement[],
): ViewportRect | null {
  return unionViewportRects(children.map((child) => measureElementViewportRect(child)));
}

/** Block-level union (full element boxes) for drop column width/height. */
export function measureChildrenBlockUnionViewportRect(
  children: readonly HTMLElement[],
): ViewportRect | null {
  return unionViewportRects(
    children.map((child) => {
      const rect = child.getBoundingClientRect();
      return rectToViewport(rect);
    }),
  );
}

export function frameViewportRectToIframeDocument(
  rect: ViewportRect,
  iframe: HTMLIFrameElement,
): ViewportRect {
  const view = iframe.contentWindow;
  const scrollX = view?.scrollX ?? 0;
  const scrollY = view?.scrollY ?? 0;

  return {
    left: rect.left + scrollX,
    top: rect.top + scrollY,
    width: rect.width,
    height: rect.height,
  };
}
