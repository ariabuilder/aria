export interface NormalizedDragPoint {
  frameX: number;
  frameY: number;
  worldX: number;
  worldY: number;
}

export interface FrameBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface NormalizeParentDragPointInput {
  clientX: number;
  clientY: number;
  frameRect: FrameBounds;
  scale?: number;
}

export interface NormalizeIframeDragPointInput {
  clientX: number;
  clientY: number;
  frameRect: FrameBounds;
  frameWidth: number;
  frameHeight: number;
  scale?: number;
}

function isInsideFrameRect(
  x: number,
  y: number,
  frameRect: FrameBounds,
): boolean {
  return (
    x >= frameRect.left &&
    x < frameRect.right &&
    y >= frameRect.top &&
    y < frameRect.bottom
  );
}

function isInsideFrameViewport(
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

export function normalizeParentDragPoint({
  clientX,
  clientY,
  frameRect,
  scale = 1,
}: NormalizeParentDragPointInput): NormalizedDragPoint | null {
  if (!isInsideFrameRect(clientX, clientY, frameRect)) {
    return null;
  }

  const resolvedScale = scale || 1;
  const frameX = (clientX - frameRect.left) / resolvedScale;
  const frameY = (clientY - frameRect.top) / resolvedScale;

  return {
    frameX,
    frameY,
    worldX: clientX,
    worldY: clientY,
  };
}

export function normalizeIframeDragPoint({
  clientX,
  clientY,
  frameRect,
  frameWidth,
  frameHeight,
  scale = 1,
}: NormalizeIframeDragPointInput): NormalizedDragPoint | null {
  if (!isInsideFrameViewport(clientX, clientY, frameWidth, frameHeight)) {
    return null;
  }

  const resolvedScale = scale || 1;

  return {
    frameX: clientX,
    frameY: clientY,
    worldX: frameRect.left + clientX * resolvedScale,
    worldY: frameRect.top + clientY * resolvedScale,
  };
}
