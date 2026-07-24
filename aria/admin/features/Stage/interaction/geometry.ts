import { z } from "zod";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { findStageNodeElement } from "../utils/findStageNodeElement";
import { measureElementViewportRect } from "../utils/overlayMeasure";

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ScrollOffset {
  scrollX: number;
  scrollY: number;
}

export interface RectLike extends ViewportRect {
  right?: number;
  bottom?: number;
}

type SpaceTaggedPoint<Space extends string> = ViewportPoint & {
  readonly coordinateSpace: Space;
};

type SpaceTaggedRect<Space extends string> = ViewportRect & {
  readonly coordinateSpace: Space;
};

export type ParentViewportPoint = Brand<
  SpaceTaggedPoint<"parent-viewport">,
  "ParentViewportPoint"
>;
export type ParentViewportRect = Brand<
  SpaceTaggedRect<"parent-viewport">,
  "ParentViewportRect"
>;

export type FrameViewportPoint = Brand<
  SpaceTaggedPoint<"frame-viewport">,
  "FrameViewportPoint"
>;
export type FrameViewportRect = Brand<
  SpaceTaggedRect<"frame-viewport">,
  "FrameViewportRect"
>;

export type IframeDocumentPoint = Brand<
  SpaceTaggedPoint<"iframe-document">,
  "IframeDocumentPoint"
>;
export type IframeDocumentRect = Brand<
  SpaceTaggedRect<"iframe-document">,
  "IframeDocumentRect"
>;

export const ViewportRectSchema = z
  .object({
    left: z.number(),
    top: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict();

export const ParentViewportRectSchema = ViewportRectSchema.extend({
  coordinateSpace: z.literal("parent-viewport"),
}).strict();

export const FrameViewportRectSchema = ViewportRectSchema.extend({
  coordinateSpace: z.literal("frame-viewport"),
}).strict();

export const IframeDocumentRectSchema = ViewportRectSchema.extend({
  coordinateSpace: z.literal("iframe-document"),
}).strict();

export const ParentViewportPointSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    coordinateSpace: z.literal("parent-viewport"),
  })
  .strict();

export const FrameViewportPointSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    coordinateSpace: z.literal("frame-viewport"),
  })
  .strict();

export const IframeDocumentPointSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    coordinateSpace: z.literal("iframe-document"),
  })
  .strict();

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function positiveScale(scale: number | undefined): number {
  return scale && Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function rightOf(rect: RectLike): number {
  return rect.right ?? rect.left + rect.width;
}

function bottomOf(rect: RectLike): number {
  return rect.bottom ?? rect.top + rect.height;
}

export function createParentViewportPoint(
  x: number,
  y: number,
): ParentViewportPoint {
  return {
    x: finite(x),
    y: finite(y),
    coordinateSpace: "parent-viewport",
  } as ParentViewportPoint;
}

export function createFrameViewportPoint(
  x: number,
  y: number,
): FrameViewportPoint {
  return {
    x: finite(x),
    y: finite(y),
    coordinateSpace: "frame-viewport",
  } as FrameViewportPoint;
}

export function createIframeDocumentPoint(
  x: number,
  y: number,
): IframeDocumentPoint {
  return {
    x: finite(x),
    y: finite(y),
    coordinateSpace: "iframe-document",
  } as IframeDocumentPoint;
}

export function createFrameViewportRect(rect: ViewportRect): FrameViewportRect {
  return {
    left: finite(rect.left),
    top: finite(rect.top),
    width: Math.max(0, finite(rect.width)),
    height: Math.max(0, finite(rect.height)),
    coordinateSpace: "frame-viewport",
  } as FrameViewportRect;
}

export function createParentViewportRect(
  rect: ViewportRect,
): ParentViewportRect {
  return {
    left: finite(rect.left),
    top: finite(rect.top),
    width: Math.max(0, finite(rect.width)),
    height: Math.max(0, finite(rect.height)),
    coordinateSpace: "parent-viewport",
  } as ParentViewportRect;
}

export function createIframeDocumentRect(
  rect: ViewportRect,
): IframeDocumentRect {
  return {
    left: finite(rect.left),
    top: finite(rect.top),
    width: Math.max(0, finite(rect.width)),
    height: Math.max(0, finite(rect.height)),
    coordinateSpace: "iframe-document",
  } as IframeDocumentRect;
}

export function isPointInParentFrame(
  point: ParentViewportPoint,
  frameRect: RectLike,
): boolean {
  return (
    point.x >= frameRect.left &&
    point.x < rightOf(frameRect) &&
    point.y >= frameRect.top &&
    point.y < bottomOf(frameRect)
  );
}

export function isPointInFrameViewport(
  point: FrameViewportPoint,
  size: ViewportSize,
): boolean {
  return (
    point.x >= 0 &&
    point.x < size.width &&
    point.y >= 0 &&
    point.y < size.height
  );
}

export function parentViewportToFrameViewport(
  point: ParentViewportPoint,
  frameRect: RectLike,
  scale = 1,
): FrameViewportPoint | null {
  if (!isPointInParentFrame(point, frameRect)) {
    return null;
  }

  const resolvedScale = positiveScale(scale);
  return createFrameViewportPoint(
    (point.x - frameRect.left) / resolvedScale,
    (point.y - frameRect.top) / resolvedScale,
  );
}

export function iframeEventToFrameViewport(
  point: Pick<ViewportPoint, "x" | "y">,
  frameViewportSize: ViewportSize,
): FrameViewportPoint | null {
  const framePoint = createFrameViewportPoint(point.x, point.y);
  return isPointInFrameViewport(framePoint, frameViewportSize)
    ? framePoint
    : null;
}

export function frameViewportPointToParentViewport(
  point: FrameViewportPoint,
  frameRect: RectLike,
  scale = 1,
): ParentViewportPoint {
  const resolvedScale = positiveScale(scale);
  return createParentViewportPoint(
    frameRect.left + point.x * resolvedScale,
    frameRect.top + point.y * resolvedScale,
  );
}

export function frameViewportRectToParentViewport(
  rect: FrameViewportRect,
  frameRect: RectLike,
  scale = 1,
): ParentViewportRect {
  const resolvedScale = positiveScale(scale);
  return createParentViewportRect({
    left: frameRect.left + rect.left * resolvedScale,
    top: frameRect.top + rect.top * resolvedScale,
    width: rect.width * resolvedScale,
    height: rect.height * resolvedScale,
  });
}

export function frameViewportPointToIframeDocument(
  point: FrameViewportPoint,
  scroll: ScrollOffset,
): IframeDocumentPoint {
  return createIframeDocumentPoint(
    point.x + scroll.scrollX,
    point.y + scroll.scrollY,
  );
}

export function frameViewportRectToIframeDocument(
  rect: FrameViewportRect,
  scroll: ScrollOffset,
): IframeDocumentRect {
  return createIframeDocumentRect({
    left: rect.left + scroll.scrollX,
    top: rect.top + scroll.scrollY,
    width: rect.width,
    height: rect.height,
  });
}

export function getIframeScroll(iframe: HTMLIFrameElement): ScrollOffset {
  const view = iframe.contentWindow;
  return {
    scrollX: view?.scrollX ?? 0,
    scrollY: view?.scrollY ?? 0,
  };
}

export function getIframeViewportSize(
  iframe: HTMLIFrameElement,
): ViewportSize {
  const view = iframe.contentWindow;
  return {
    width: view?.innerWidth || iframe.clientWidth,
    height: view?.innerHeight || iframe.clientHeight,
  };
}

export function measureElementFrameViewportRect(
  element: Element,
): FrameViewportRect {
  return createFrameViewportRect(measureElementViewportRect(element));
}

export function measureNodeFrameViewportRect(
  doc: Document,
  nodeId: string,
  blocks: readonly BuilderNode[] = [],
): FrameViewportRect | null {
  const element = findStageNodeElement(doc, blocks, nodeId);

  return element ? measureElementFrameViewportRect(element) : null;
}
