export const CANVAS_SELECTION_RESIZE_HANDLES = [
  "north-west",
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
] as const;

export type CanvasSelectionResizeHandle =
  (typeof CANVAS_SELECTION_RESIZE_HANDLES)[number];

export interface CanvasSelectionSize {
  width: number;
  height: number;
}

export interface CanvasSelectionScale {
  x: number;
  y: number;
}

const MIN_CANVAS_SELECTION_SIZE = 1;

function isWestHandle(handle: CanvasSelectionResizeHandle): boolean {
  return handle === "west" || handle.endsWith("-west");
}

function isEastHandle(handle: CanvasSelectionResizeHandle): boolean {
  return handle === "east" || handle.endsWith("-east");
}

function isNorthHandle(handle: CanvasSelectionResizeHandle): boolean {
  return handle === "north" || handle.startsWith("north-");
}

function isSouthHandle(handle: CanvasSelectionResizeHandle): boolean {
  return handle === "south" || handle.startsWith("south-");
}

export function canvasSelectionResizeAxes(
  handle: CanvasSelectionResizeHandle,
): { width: boolean; height: boolean } {
  return {
    width: isWestHandle(handle) || isEastHandle(handle),
    height: isNorthHandle(handle) || isSouthHandle(handle),
  };
}

export function resizeCanvasSelection(input: {
  handle: CanvasSelectionResizeHandle;
  startSize: CanvasSelectionSize;
  deltaX: number;
  deltaY: number;
  minimumSize?: number;
}): CanvasSelectionSize {
  const minimumSize = Math.max(
    MIN_CANVAS_SELECTION_SIZE,
    input.minimumSize ?? MIN_CANVAS_SELECTION_SIZE,
  );
  const widthDelta = isWestHandle(input.handle)
    ? -input.deltaX
    : isEastHandle(input.handle)
      ? input.deltaX
      : 0;
  const heightDelta = isNorthHandle(input.handle)
    ? -input.deltaY
    : isSouthHandle(input.handle)
      ? input.deltaY
      : 0;

  return {
    width: Math.max(minimumSize, input.startSize.width + widthDelta),
    height: Math.max(minimumSize, input.startSize.height + heightDelta),
  };
}

export function getCanvasSelectionScale(
  iframe: HTMLIFrameElement | null | undefined,
): CanvasSelectionScale {
  if (!iframe) {
    return { x: 1, y: 1 };
  }

  const rect = iframe.getBoundingClientRect();
  const x = iframe.clientWidth > 0 ? rect.width / iframe.clientWidth : 1;
  const y = iframe.clientHeight > 0 ? rect.height / iframe.clientHeight : 1;

  return {
    x: Number.isFinite(x) && x > 0 ? x : 1,
    y: Number.isFinite(y) && y > 0 ? y : 1,
  };
}

export function measureCanvasSelectionElement(
  element: Element | null | undefined,
): CanvasSelectionSize | null {
  if (!element || !element.isConnected) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
    return null;
  }

  return {
    width: Math.max(0, rect.width),
    height: Math.max(0, rect.height),
  };
}

export function formatCanvasSelectionSize(size: CanvasSelectionSize): string {
  return `${Math.round(size.width)} × ${Math.round(size.height)}`;
}

export function canvasSelectionResizeCursor(
  handle: CanvasSelectionResizeHandle,
): "ns-resize" | "ew-resize" | "nwse-resize" | "nesw-resize" {
  switch (handle) {
    case "north":
    case "south":
      return "ns-resize";
    case "east":
    case "west":
      return "ew-resize";
    case "north-west":
    case "south-east":
      return "nwse-resize";
    case "north-east":
    case "south-west":
      return "nesw-resize";
  }
}
