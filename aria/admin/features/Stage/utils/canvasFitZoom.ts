export const MIN_CANVAS_ZOOM = 10;
export const MAX_CANVAS_ZOOM = 200;

export interface ComputeCanvasFitZoomOptions {
  scaleMode: "fit" | "natural";
  disableCanvasScaling?: boolean;
  containerWidth: number | null;
  fitTargetWidth: number | null;
}

export function clampCanvasZoom(value: number): number {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, value));
}

export function computeCanvasFitZoom(
  options: ComputeCanvasFitZoomOptions,
): number {
  const {
    scaleMode,
    disableCanvasScaling = false,
    containerWidth,
    fitTargetWidth,
  } = options;

  if (scaleMode === "natural" || disableCanvasScaling) {
    return 100;
  }

  if (!containerWidth || !fitTargetWidth || fitTargetWidth <= 0) {
    return 100;
  }

  if (fitTargetWidth <= containerWidth) {
    return 100;
  }

  const fitRatio = containerWidth / fitTargetWidth;
  return clampCanvasZoom(Math.round(Math.min(1, fitRatio) * 100));
}
