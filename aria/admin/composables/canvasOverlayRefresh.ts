type CanvasOverlayRefreshMode = "measure" | "translate";

let canvasOverlayPositionScheduler:
  | ((mode?: CanvasOverlayRefreshMode) => void)
  | null = null;

export function registerCanvasOverlayPositionScheduler(
  scheduler: (mode?: CanvasOverlayRefreshMode) => void,
): void {
  canvasOverlayPositionScheduler = scheduler;
}

export function unregisterCanvasOverlayPositionScheduler(): void {
  canvasOverlayPositionScheduler = null;
}

export function refreshCanvasOverlayPositions(
  mode: CanvasOverlayRefreshMode = "measure",
): void {
  canvasOverlayPositionScheduler?.(mode);
}
