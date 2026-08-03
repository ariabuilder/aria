import { isStructuralContainerNodeType } from "../../../../lib/blocks/containerTypes";
import {
  measureChildrenBlockUnionViewportRect,
  measureElementViewportRect,
} from "../utils/overlayMeasure";

export const INSERTION_LINE_CLASS = "drop-insertion-line" as const;

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InsertionTargetResult {
  dropParent: HTMLElement;
  dropParentId: string;
  isRoot: boolean;
}

export interface AddElementsDropLayout {
  insertionIndex: number;
  placeholder: ViewportRect;
  target?: ViewportRect;
  orientation: "horizontal" | "vertical";
}

function orientationForRect(rect: ViewportRect): "horizontal" | "vertical" {
  return rect.height > rect.width ? "vertical" : "horizontal";
}

function isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function isHtmlElement(value: Element | null): value is HTMLElement {
  return Boolean(
    value &&
    value.nodeType === 1 &&
    "style" in value &&
    typeof value.getBoundingClientRect === "function",
  );
}

export function findNearestAriaBlock(
  hit: Element | null,
  stopAt: HTMLElement,
): HTMLElement | null {
  let current: Element | null = hit;

  while (current && current !== stopAt) {
    if (isHtmlElement(current) && current.hasAttribute("data-aria-id")) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

export function findNearestAriaBlockFromPoint(
  doc: Document,
  x: number,
  y: number,
  stopAt: HTMLElement,
): HTMLElement | null {
  const stack = doc.elementsFromPoint(x, y);
  for (const el of stack) {
    const block = findNearestAriaBlock(el, stopAt);
    if (block) {
      return block;
    }
  }
  return null;
}

function findDeepestStructuralContainerFromPoint(
  doc: Document,
  x: number,
  y: number,
  stopAt: HTMLElement,
): HTMLElement | null {
  const candidates = new Set<HTMLElement>();

  for (const el of doc.elementsFromPoint(x, y)) {
    let current: Element | null = el;

    while (current && current !== stopAt) {
      if (isHtmlElement(current) && current.hasAttribute("data-aria-id")) {
        const ariaType = current.getAttribute("data-aria-type") ?? "";
        if (isStructuralContainerNodeType(ariaType)) {
          const rect = current.getBoundingClientRect();
          if (isPointInsideRect(x, y, rect)) {
            candidates.add(current);
          }
        }
      }

      current = current.parentElement;
    }
  }

  return (
    Array.from(candidates).sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectA.width * rectA.height - rectB.width * rectB.height;
    })[0] ?? null
  );
}

export function findInsertionParentElement(
  block: HTMLElement,
  contentRoot: HTMLElement,
  body: HTMLElement,
): HTMLElement {
  let parentEl = block.parentElement;

  while (parentEl && parentEl !== body) {
    if (isHtmlElement(parentEl) && parentEl.hasAttribute("data-drop-zone")) {
      const ariaType = parentEl.getAttribute("data-aria-type") ?? "";
      if (isStructuralContainerNodeType(ariaType)) {
        return parentEl;
      }
    }
    parentEl = parentEl.parentElement;
  }

  return contentRoot;
}

/**
 * Resolves the structural parent that will receive the new node.
 * When the pointer is over a container's padding, insert into that container.
 */
export function resolveInsertionTarget(
  hit: Element | null,
  cursorX: number,
  cursorY: number,
  contentRoot: HTMLElement,
  body: HTMLElement,
  doc?: Document | null,
): InsertionTargetResult {
  const structuralContainer = doc
    ? findDeepestStructuralContainerFromPoint(doc, cursorX, cursorY, body)
    : null;

  if (structuralContainer) {
    const zoneId =
      structuralContainer.getAttribute("data-zone-id") ??
      structuralContainer.getAttribute("data-aria-id") ??
      structuralContainer.id;

    return {
      dropParent: structuralContainer,
      dropParentId: zoneId,
      isRoot: structuralContainer === contentRoot,
    };
  }

  const block =
    (doc ? findNearestAriaBlockFromPoint(doc, cursorX, cursorY, body) : null) ??
    findNearestAriaBlock(hit, body);

  if (!block) {
    return {
      dropParent: contentRoot,
      dropParentId: "__aria-root__",
      isRoot: true,
    };
  }

  const ariaType = block.getAttribute("data-aria-type") ?? "";
  const blockRect = block.getBoundingClientRect();

  if (
    isStructuralContainerNodeType(ariaType) &&
    isPointInsideRect(cursorX, cursorY, blockRect)
  ) {
    const zoneId = block.getAttribute("data-zone-id") ?? block.id;
    return {
      dropParent: block,
      dropParentId: zoneId,
      isRoot: block === contentRoot,
    };
  }

  const insertionParent = findInsertionParentElement(block, contentRoot, body);
  const parentId =
    insertionParent === contentRoot
      ? "__aria-root__"
      : (insertionParent.getAttribute("data-zone-id") ??
        insertionParent.getAttribute("data-aria-id") ??
        "__aria-root__");

  return {
    dropParent: insertionParent,
    dropParentId: parentId,
    isRoot: insertionParent === contentRoot,
  };
}

export function getDroppableChildren(dropZone: Element): HTMLElement[] {
  return Array.from(dropZone.children).filter((el): el is HTMLElement => {
    if (!isHtmlElement(el)) {
      return false;
    }

    return (
      el.hasAttribute("data-aria-id") &&
      !el.classList.contains(INSERTION_LINE_CLASS)
    );
  });
}

type DropZoneStyle = {
  display: string;
  flexDirection: string;
  flexWrap: string;
  direction: string;
  gridTemplateColumns: string;
};

function readDropStyle(dropZone: HTMLElement): DropZoneStyle {
  const style = dropZone.ownerDocument.defaultView?.getComputedStyle(dropZone);
  return {
    display: style?.display ?? "block",
    flexDirection: style?.flexDirection ?? "column",
    flexWrap: style?.flexWrap ?? "nowrap",
    direction: style?.direction ?? "ltr",
    gridTemplateColumns: style?.gridTemplateColumns ?? "none",
  };
}

function readDropAxis(dropZone: HTMLElement): "horizontal" | "vertical" {
  const style = readDropStyle(dropZone);

  if (style.display.includes("flex")) {
    return style.flexDirection.startsWith("row") ? "horizontal" : "vertical";
  }

  return "vertical";
}

function isGridDropZone(dropZone: HTMLElement): boolean {
  return readDropStyle(dropZone).display.includes("grid");
}

function isWrappedHorizontalDropZone(dropZone: HTMLElement): boolean {
  const style = readDropStyle(dropZone);
  return (
    style.display.includes("flex") &&
    style.flexDirection.startsWith("row") &&
    style.flexWrap !== "nowrap"
  );
}

function calculateGridInsertionIndex(
  children: readonly HTMLElement[],
  cursorX: number,
  cursorY: number,
): number {
  const rowTolerance = 8;
  const rows: HTMLElement[][] = [];

  for (const child of children) {
    const rect = child.getBoundingClientRect();
    const row = rows.find((entries) => {
      const firstRect = entries[0]?.getBoundingClientRect();
      return firstRect
        ? Math.abs(firstRect.top - rect.top) <= rowTolerance
        : false;
    });

    if (row) {
      row.push(child);
    } else {
      rows.push([child]);
    }
  }

  rows.sort((a, b) => {
    const rectA = a[0].getBoundingClientRect();
    const rectB = b[0].getBoundingClientRect();
    return rectA.top - rectB.top;
  });

  for (const row of rows) {
    row.sort(
      (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left,
    );
    const rowTop = Math.min(
      ...row.map((child) => child.getBoundingClientRect().top),
    );
    const rowBottom = Math.max(
      ...row.map((child) => {
        const rect = child.getBoundingClientRect();
        return rect.top + rect.height;
      }),
    );
    const rowMidY = rowTop + (rowBottom - rowTop) / 2;

    if (cursorY <= rowMidY) {
      const domIndexes = row.map((child) => children.indexOf(child));
      const ascendingDomOrder =
        domIndexes.length < 2 ||
        domIndexes[0] < domIndexes[domIndexes.length - 1];
      const rowStart = Math.min(...domIndexes);

      for (let visualIndex = 0; visualIndex < row.length; visualIndex += 1) {
        const child = row[visualIndex];
        const rect = child.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        if (cursorX < midX) {
          return (
            rowStart +
            (ascendingDomOrder ? visualIndex : row.length - visualIndex)
          );
        }
      }

      return rowStart + (ascendingDomOrder ? row.length : 0);
    }
  }

  return children.length;
}

/**
 * Before/after insertion: index before first sibling whose midpoint is below cursor.
 */
export function calculateInsertionIndexMidline(
  children: readonly HTMLElement[],
  cursorX: number,
  cursorY: number,
  dropZone: HTMLElement,
): number {
  if (children.length === 0) {
    return 0;
  }

  if (isGridDropZone(dropZone) || isWrappedHorizontalDropZone(dropZone)) {
    return calculateGridInsertionIndex(children, cursorX, cursorY);
  }

  const axis = readDropAxis(dropZone);

  if (axis === "horizontal") {
    const firstCenter =
      children[0].getBoundingClientRect().left +
      children[0].getBoundingClientRect().width / 2;
    const lastCenter =
      children[children.length - 1].getBoundingClientRect().left +
      children[children.length - 1].getBoundingClientRect().width / 2;
    const ascending = firstCenter <= lastCenter;
    const visualChildren = ascending ? children : [...children].reverse();
    for (let i = 0; i < visualChildren.length; i++) {
      const rect = visualChildren[i].getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (cursorX < midX) {
        return ascending ? i : children.length - i;
      }
    }
    return ascending ? children.length : 0;
  }

  const firstCenter =
    children[0].getBoundingClientRect().top +
    children[0].getBoundingClientRect().height / 2;
  const lastCenter =
    children[children.length - 1].getBoundingClientRect().top +
    children[children.length - 1].getBoundingClientRect().height / 2;
  const ascending = firstCenter <= lastCenter;
  const visualChildren = ascending ? children : [...children].reverse();
  for (let i = 0; i < visualChildren.length; i++) {
    const rect = visualChildren[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (cursorY < midY) {
      return ascending ? i : children.length - i;
    }
  }

  return ascending ? children.length : 0;
}

function sameVisualRow(a: ViewportRect, b: ViewportRect): boolean {
  return Math.abs(a.top - b.top) <= 8;
}

function computeHorizontalFlowPlaceholder(
  dropParent: HTMLElement,
  parentRect: ViewportRect,
  children: readonly HTMLElement[],
  insertionIndex: number,
): ViewportRect {
  const barThickness = 3;
  const style = readDropStyle(dropParent);
  const reversedByFlex = style.flexDirection === "row-reverse";
  const reversedByDirection = style.direction === "rtl";
  const domAscendsVisually = !(reversedByFlex !== reversedByDirection);
  const next =
    insertionIndex < children.length
      ? measureChildBlockRect(children[insertionIndex])
      : null;
  const previous =
    insertionIndex > 0
      ? measureChildBlockRect(children[insertionIndex - 1])
      : null;

  if (!previous && next) {
    return {
      left: domAscendsVisually
        ? next.left - barThickness / 2 - 1
        : next.left + next.width + 1,
      top: next.top,
      width: barThickness,
      height: Math.max(next.height, 48),
    };
  }

  if (previous && next && !sameVisualRow(previous, next)) {
    return {
      left: parentRect.left,
      top: (previous.top + previous.height + next.top) / 2 - barThickness / 2,
      width: parentRect.width,
      height: barThickness,
    };
  }

  const reference = previous ?? next;
  if (!reference) {
    return {
      left: parentRect.left + 8,
      top: parentRect.top + 4,
      width: barThickness,
      height: Math.max(parentRect.height - 8, 48),
    };
  }

  const left =
    previous && next
      ? (previous.left + previous.width + next.left) / 2 - barThickness / 2
      : previous
        ? domAscendsVisually
          ? previous.left + previous.width + 1
          : previous.left - barThickness / 2 - 1
        : reference.left - barThickness / 2 - 1;
  const top =
    previous && next ? Math.min(previous.top, next.top) : reference.top;
  const bottom =
    previous && next
      ? Math.max(previous.top + previous.height, next.top + next.height)
      : reference.top + reference.height;
  return {
    left,
    top,
    width: barThickness,
    height: Math.max(bottom - top, 48),
  };
}

function measureChildBlockRect(child: HTMLElement): ViewportRect {
  const rect = child.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Viewport rect for the insertion placeholder bar between siblings.
 */
export function computePlaceholderViewportRect(
  dropParent: HTMLElement,
  children: readonly HTMLElement[],
  insertionIndex: number,
): ViewportRect {
  const parentRect =
    measureChildrenBlockUnionViewportRect(children) ??
    measureElementViewportRect(dropParent);
  const boundsInset = children.length > 0 ? 0 : 4;
  const axis = readDropAxis(dropParent);
  const barThickness = 3;

  if (children.length === 0) {
    if (axis === "horizontal") {
      return {
        left: parentRect.left + 8,
        top: parentRect.top + boundsInset,
        width: barThickness,
        height: Math.max(parentRect.height - boundsInset * 2, 48),
      };
    }
    return {
      left: parentRect.left + boundsInset,
      top: parentRect.top + 8,
      width: Math.max(parentRect.width - boundsInset * 2, 48),
      height: barThickness,
    };
  }

  if (
    axis === "horizontal" ||
    isGridDropZone(dropParent) ||
    isWrappedHorizontalDropZone(dropParent)
  ) {
    return computeHorizontalFlowPlaceholder(
      dropParent,
      parentRect,
      children,
      insertionIndex,
    );
  }

  if (insertionIndex === 0) {
    const first = measureChildBlockRect(children[0]);
    return {
      left: parentRect.left,
      top: first.top - barThickness / 2 - 1,
      width: parentRect.width,
      height: barThickness,
    };
  }

  const prev = measureChildBlockRect(children[insertionIndex - 1]);
  let top: number;

  if (insertionIndex < children.length) {
    const next = measureChildBlockRect(children[insertionIndex]);
    top = (prev.top + prev.height + next.top) / 2 - barThickness / 2;
  } else {
    top = prev.top + prev.height + 1;
  }

  return {
    left: parentRect.left,
    top,
    width: parentRect.width,
    height: barThickness,
  };
}

/**
 * Thin target outline around the insertion parent (viewport coords).
 */
export function computeTargetViewportRect(
  dropParent: HTMLElement,
): ViewportRect {
  const children = getDroppableChildren(dropParent);
  const union = measureChildrenBlockUnionViewportRect(children);
  if (union) {
    return union;
  }

  return measureElementViewportRect(dropParent);
}

export function computeAddElementsDropLayout(
  dropParent: HTMLElement,
  cursorX: number,
  cursorY: number,
): AddElementsDropLayout {
  const children = getDroppableChildren(dropParent);
  const insertionIndex = calculateInsertionIndexMidline(
    children,
    cursorX,
    cursorY,
    dropParent,
  );
  const placeholder = computePlaceholderViewportRect(
    dropParent,
    children,
    insertionIndex,
  );

  return {
    insertionIndex,
    placeholder,
    target:
      children.length === 0 ? computeTargetViewportRect(dropParent) : undefined,
    // Orientation describes the measured line, not the parent flow axis.
    // The rectangle remains authoritative for rendering dimensions.
    orientation: orientationForRect(placeholder),
  };
}
