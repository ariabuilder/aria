/**
 * Aria mark geometry — derived from aria/admin/assets/aria-icon. svg.
 */

export const ARIA_MARK_VIEWBOX = "0 0 727 621";

export const ARIA_MARK_TRANSFORM =
  "matrix(3.040039,0,0,3.040039,-1199.199655,-483.005411)";

export const ARIA_MARK_BODY_PATH =
  "M414.732,338.7C442.022,309.726 452.417,298.214 500.646,253.658C512.365,242.832 523.508,234.73 513.564,239.686C500.707,246.094 500.657,245.764 487.46,251.41C470,258.88 461.944,263.285 464.958,258.731C469.373,252.058 512.107,173.735 516.155,166.315C518.494,162.028 520.3,156.021 522.635,160.418C530.999,176.165 582.223,266.793 581.907,268.613C581.52,270.842 559.235,275.253 510.245,305.078C453.735,339.482 431.962,362.56 425.5,362.599C396.026,362.777 394.261,363.97 394.484,361.498C394.527,361.022 412.163,341.452 414.732,338.7Z";

export const ARIA_MARK_ACCENT_PATH =
  "M586.593,339.432C573.418,319.82 558.933,300.218 559.359,298.438C559.65,297.221 582.442,286.66 588.389,284.234C591.726,282.872 591.39,285.149 606.332,311.59C608.533,315.486 633.154,359.057 633.453,360.512C633.903,362.709 632.325,362.608 605.5,362.595C600.629,362.592 601.571,360.517 586.593,339.432Z";

export interface AriaMarkAnchorPoint {
  id: string;
  cx: number;
  cy: number;
}

export interface AriaMarkHandleLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Construction points are in the final 727×621 viewport, not the
 * source SVG group coordinates. They mark recognizable corners/control points.
 */
export const ARIA_MARK_ANCHOR_POINTS: readonly AriaMarkAnchorPoint[] = [
  { id: "body-foot-left", cx: 2, cy: 618 },
  { id: "body-curve-left", cx: 214, cy: 304 },
  { id: "body-apex", cx: 385, cy: 0 },
  { id: "body-shoulder-right", cx: 569, cy: 334 },
  { id: "body-foot-right", cx: 95, cy: 619 },
  { id: "accent-joint", cx: 502, cy: 424 },
  { id: "accent-module", cx: 590, cy: 381 },
  { id: "accent-foot", cx: 726, cy: 613 },
] as const;

export const ARIA_MARK_HANDLE_LINES: readonly AriaMarkHandleLine[] = [
  { id: "left-curve-handle", x1: 214, y1: 304, x2: 282, y2: 236 },
  { id: "apex-left-handle", x1: 385, y1: 0, x2: 340, y2: 92 },
  { id: "apex-right-handle", x1: 385, y1: 0, x2: 455, y2: 107 },
  { id: "right-shoulder-handle", x1: 569, y1: 334, x2: 505, y2: 374 },
  { id: "accent-handle", x1: 590, y1: 381, x2: 638, y2: 479 },
] as const;

/**
 * Construction animation: anchors establish the mark, handles and wireframe draw
 * like a builder canvas, then the solid logo assembles into.
 */

export const PRELOADER_MARK_READY_PULSE_DELAY_MS = 1040;
export const PRELOADER_MARK_READY_PULSE_DURATION_MS = 420;

/** Anchor points. */
export const PRELOADER_MARK_ANCHOR_DURATION_MS = 360;
export const PRELOADER_MARK_ANCHOR_STAGGER_MS = 70;

/** Bezier handles. */
export const PRELOADER_MARK_HANDLE_DURATION_MS = 420;
export const PRELOADER_MARK_HANDLE_DELAY_MS = 160;
export const PRELOADER_MARK_HANDLE_STAGGER_MS = 46;

/** Wireframe path draw. */
export const PRELOADER_MARK_BODY_DRAW_DURATION_MS = 760;
export const PRELOADER_MARK_BODY_DRAW_DELAY_MS = 280;

/** Accent path draw trails the main wireframe. */
export const PRELOADER_MARK_ACCENT_DRAW_DURATION_MS = 560;
export const PRELOADER_MARK_ACCENT_DRAW_DELAY_MS = 430;

/** Solid assembly. */
export const PRELOADER_MARK_FILL_DURATION_MS = 460;
export const PRELOADER_MARK_BODY_FILL_DELAY_MS = 820;
export const PRELOADER_MARK_ACCENT_FILL_DELAY_MS = 1040;
export const PRELOADER_MARK_ACCENT_ATTACH_DURATION_MS = 460;

/** Decorative grid trails the mark. */
export const PRELOADER_GRID_BORDER_DELAY_MS = 80;
export const PRELOADER_GRID_BORDER_DURATION_MS = 420;
export const PRELOADER_GRID_LINE_H_DELAY_MS = 180;
export const PRELOADER_GRID_LINE_V_DELAY_MS = 260;
export const PRELOADER_GRID_LINE_DURATION_MS = 380;

export const PRELOADER_MARK_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
export const PRELOADER_FILL_EASING = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";
export const PRELOADER_ATTACH_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
export const PRELOADER_GRID_EASING = "ease";

/** CSS custom properties for preloader mark + grid timing (Vue + SSR). */
export const PRELOADER_ARIA_LOGO_CSS_VARS: Record<string, string> = {
  "--preloader-mark-ready-pulse-delay": `${PRELOADER_MARK_READY_PULSE_DELAY_MS}ms`,
  "--preloader-mark-ready-pulse-duration": `${PRELOADER_MARK_READY_PULSE_DURATION_MS}ms`,
  "--preloader-mark-anchor-duration": `${PRELOADER_MARK_ANCHOR_DURATION_MS}ms`,
  "--preloader-mark-anchor-stagger": `${PRELOADER_MARK_ANCHOR_STAGGER_MS}ms`,
  "--preloader-mark-handle-duration": `${PRELOADER_MARK_HANDLE_DURATION_MS}ms`,
  "--preloader-mark-handle-delay": `${PRELOADER_MARK_HANDLE_DELAY_MS}ms`,
  "--preloader-mark-handle-stagger": `${PRELOADER_MARK_HANDLE_STAGGER_MS}ms`,
  "--preloader-mark-body-draw-duration": `${PRELOADER_MARK_BODY_DRAW_DURATION_MS}ms`,
  "--preloader-mark-body-draw-delay": `${PRELOADER_MARK_BODY_DRAW_DELAY_MS}ms`,
  "--preloader-mark-accent-draw-duration": `${PRELOADER_MARK_ACCENT_DRAW_DURATION_MS}ms`,
  "--preloader-mark-accent-draw-delay": `${PRELOADER_MARK_ACCENT_DRAW_DELAY_MS}ms`,
  "--preloader-mark-fill-duration": `${PRELOADER_MARK_FILL_DURATION_MS}ms`,
  "--preloader-mark-body-fill-delay": `${PRELOADER_MARK_BODY_FILL_DELAY_MS}ms`,
  "--preloader-mark-accent-fill-delay": `${PRELOADER_MARK_ACCENT_FILL_DELAY_MS}ms`,
  "--preloader-mark-accent-attach-duration": `${PRELOADER_MARK_ACCENT_ATTACH_DURATION_MS}ms`,
  "--preloader-grid-border-delay": `${PRELOADER_GRID_BORDER_DELAY_MS}ms`,
  "--preloader-grid-border-duration": `${PRELOADER_GRID_BORDER_DURATION_MS}ms`,
  "--preloader-grid-line-h-delay": `${PRELOADER_GRID_LINE_H_DELAY_MS}ms`,
  "--preloader-grid-line-v-delay": `${PRELOADER_GRID_LINE_V_DELAY_MS}ms`,
  "--preloader-grid-line-duration": `${PRELOADER_GRID_LINE_DURATION_MS}ms`,
  "--preloader-mark-easing": PRELOADER_MARK_EASING,
  "--preloader-fill-easing": PRELOADER_FILL_EASING,
  "--preloader-attach-easing": PRELOADER_ATTACH_EASING,
  "--preloader-grid-easing": PRELOADER_GRID_EASING,
};
