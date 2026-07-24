import type { DropPosition } from "../types";

const EDGE_ZONE_RATIO = 0.32;
const MIN_EDGE_ZONE_PX = 8;
const MAX_EDGE_ZONE_PX = 14;

export function resolveLayerDropPosition(rawMetrics: {
  clientY: number;
  top: number;
  height: number;
  allowInside: boolean;
}): DropPosition {
  if (
    !Number.isFinite(rawMetrics.clientY) ||
    !Number.isFinite(rawMetrics.top) ||
    !Number.isFinite(rawMetrics.height) ||
    rawMetrics.height <= 0
  ) {
    throw new TypeError("Layer drop metrics must contain a positive finite height");
  }

  const metrics = rawMetrics;
  const offset = Math.min(
    Math.max(metrics.clientY - metrics.top, 0),
    metrics.height,
  );

  if (!metrics.allowInside) {
    return offset < metrics.height / 2 ? "before" : "after";
  }

  const edgeZone = Math.min(
    metrics.height * 0.42,
    Math.max(
      MIN_EDGE_ZONE_PX,
      Math.min(MAX_EDGE_ZONE_PX, metrics.height * EDGE_ZONE_RATIO),
    ),
  );
  const topThreshold = edgeZone;
  const bottomThreshold = metrics.height - edgeZone;

  if (offset <= topThreshold) {
    return "before";
  }

  if (offset >= bottomThreshold) {
    return "after";
  }

  return "inside";
}

export function didDragLeaveElement(
  event: DragEvent,
  element: HTMLElement,
): boolean {
  const nextTarget = event.relatedTarget;
  return !(nextTarget instanceof Node && element.contains(nextTarget));
}
