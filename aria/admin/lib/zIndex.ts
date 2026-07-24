/**
 * Application z-index scale. Canvas overlays (40–47) sit above the
 * stage iframe but below shadcn floating UI (z-50).
 */

export const Z_INDEX = {
  /** Sticky bars, cards, and other in-layout elevation */
  raised: 10,

  /** Canvas overlays teleported to `document.body` */
  canvas: {
    hover: 40,
    selection: 41,
    toolbar: 42,
    insertion: 43,
    dropZone: 44,
    addElements: 45,
    markupPreview: 46,
  },

  /** Drag ghosts appended to `document.body` */
  dragGhost: 47,

  /** shadcn / Reka overlays (matches Tailwind `z-50`) */
  modal: 50,

  /** Sidebar nav flyouts, header action tooltips */
  flyout: 60,

  /** Dev-only panels */
  debug: 90,

  /** Full-screen shell transitions and preloaders */
  shellOverlay: 95,

  /** Toasts — topmost interactive layer */
  toast: 100,
} as const;

/** @deprecated Use `Z_INDEX.canvas` — kept for existing imports */
export const CANVAS_OVERLAY_Z_INDEX = Z_INDEX.canvas;

/** @deprecated Alias for `CANVAS_OVERLAY_Z_INDEX` */
export const OVERLAY_Z_INDEX = Z_INDEX.canvas;

/**
 * Layering inside the stage iframe document.
 * Values are intentionally maximal so overlays beat author z-index on nodes.
 */
export const IFRAME_Z_INDEX = {
  secondary: 2147483645,
  overlay: 2147483646,
  insertion: 2147483647,
} as const;
