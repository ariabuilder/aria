import {
  computeAddElementsDropLayout,
  resolveInsertionTarget,
} from "../dragdrop/canvasDropInsertion";
import {
  createFrameViewportRect,
  type FrameViewportPoint,
} from "./geometry";
import { resolveNodeAtPoint } from "./hitTesting";
import type { DropIntent } from "./intents";
import type { VisualOverlayDescriptor } from "./overlayDescriptors";

export const ROOT_DROP_PARENT_ID = "__aria-root__" as const;

export interface LibraryDropResolution {
  intent: DropIntent;
  dropParent: HTMLElement;
  dropParentId: string;
  overlays: VisualOverlayDescriptor[];
}

export interface LibraryDropResolverInput {
  doc: Document;
  point: FrameViewportPoint;
  contentRoot: HTMLElement;
  body: HTMLElement;
}

export interface NodeMoveDropResolverInput {
  doc: Document;
  point: FrameViewportPoint;
  sourceNodeId: string;
}

function toIntentParentId(dropParentId: string): string | null {
  return dropParentId === ROOT_DROP_PARENT_ID ? null : dropParentId;
}

function getElementSiblingIndex(element: HTMLElement): number {
  const parent = element.parentElement;
  if (!parent) {
    return 0;
  }

  return Array.from(parent.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.hasAttribute("data-aria-id"),
  ).indexOf(element);
}

function resolveParentId(element: HTMLElement): string | null {
  const parent = element.parentElement?.closest<HTMLElement>("[data-aria-id]");
  return parent?.getAttribute("data-aria-id") ?? null;
}

export function resolveLibraryDropIntent({
  doc,
  point,
  contentRoot,
  body,
}: LibraryDropResolverInput): LibraryDropResolution {
  const element = doc.elementFromPoint(point.x, point.y);
  const { dropParent, dropParentId } = resolveInsertionTarget(
    element,
    point.x,
    point.y,
    contentRoot,
    body,
    doc,
  );
  const layout = computeAddElementsDropLayout(dropParent, point.x, point.y);
  const insertionRect = createFrameViewportRect(layout.placeholder);
  const targetRect = layout.target
    ? createFrameViewportRect(layout.target)
    : undefined;

  const overlays: VisualOverlayDescriptor[] = [
    {
      kind: "insertion",
      id: `library-insertion:${dropParentId}`,
      rect: insertionRect,
      orientation: layout.orientation,
      variant: "library",
    },
  ];

  if (targetRect) {
    overlays.push({
      kind: "target-outline",
      id: `library-target:${dropParentId}`,
      nodeId: dropParentId,
      rect: targetRect,
      variant: "empty-container",
    });
  }

  return {
    dropParent,
    dropParentId,
    overlays,
    intent: {
      kind: "insert",
      source: "library",
      parentId: toIntentParentId(dropParentId),
      targetNodeId: dropParentId === ROOT_DROP_PARENT_ID ? null : dropParentId,
      index: layout.insertionIndex,
      position: "inside",
      point,
      visualRects: {
        insertion: insertionRect,
        target: targetRect,
      },
      overlays,
    },
  };
}

export function resolveNodeMoveDropIntent({
  doc,
  point,
  sourceNodeId,
}: NodeMoveDropResolverInput): DropIntent | null {
  const target = resolveNodeAtPoint(doc, point, {
    lockComponentInstances: true,
  });

  if (!target || target.nodeId === sourceNodeId) {
    return null;
  }

  const rect = target.element.getBoundingClientRect();
  const before = point.y < rect.top + rect.height / 2;
  const targetIndex = getElementSiblingIndex(target.element);
  const insertionIndex = before ? targetIndex : targetIndex + 1;
  const insertionTop = before ? rect.top : rect.bottom;
  const insertionRect = createFrameViewportRect({
    left: rect.left,
    top: insertionTop,
    width: rect.width,
    height: 3,
  });
  const overlay: VisualOverlayDescriptor = {
    kind: "insertion",
    id: `reorder-insertion:${target.nodeId}`,
    rect: insertionRect,
    orientation: "horizontal",
    variant: "reorder",
  };

  return {
    kind: "move",
    source: "canvas",
    nodeId: sourceNodeId,
    parentId: resolveParentId(target.element),
    targetNodeId: target.nodeId,
    index: insertionIndex,
    position: before ? "before" : "after",
    point,
    visualRects: {
      insertion: insertionRect,
    },
    overlays: [overlay],
  };
}
