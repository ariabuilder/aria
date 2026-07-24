export const CANVAS_ZOOM_TRANSITION_MS = 180 as const;

export const CANVAS_ZOOM_EASING = "cubic-bezier(0.4, 0, 0.2, 1)" as const;

export function prefersReducedCanvasMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Light ease-out for zoom interpolation (avoids the heavy feel of cubic). */
export function easeOutQuad(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return 1 - (1 - clamped) * (1 - clamped);
}

export function easeOutCubic(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return 1 - Math.pow(1 - clamped, 3);
}

export function computeWheelZoomDelta(deltaY: number): number {
  const magnitude = Math.max(1, Math.min(8, Math.abs(deltaY) * 0.05));
  return deltaY < 0 ? magnitude : -magnitude;
}

export function computeAnchoredScrollLeft(
  scrollLeft: number,
  scrollWidth: number,
  cursorX: number,
  nextScrollWidth: number,
): number {
  if (scrollWidth <= 0 || nextScrollWidth <= 0) {
    return scrollLeft;
  }

  const cursorRatio = (scrollLeft + cursorX) / scrollWidth;
  return cursorRatio * nextScrollWidth - cursorX;
}
