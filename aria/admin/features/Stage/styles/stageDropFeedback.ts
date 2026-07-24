/**
 * Theme-aware drop / reorder feedback for the stage iframe and programmatic overlays.
 */

import { IFRAME_Z_INDEX } from "@/lib/zIndex";

const DROP_ZONE_STYLE_SNAPSHOT = new WeakMap<
  HTMLElement,
  {
    outline: string;
    outlineOffset: string;
    backgroundColor: string;
    boxShadow: string;
    borderColor: string;
    position: string;
  }
>();

const HSL_CHANNELS_RE = /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/;

/**
 * Resolves `--primary` to a valid CSS color in any supported theme format.
 */
/** Composer shell theme primary (not site/page tokens inside the iframe). */
export function resolveAdminPrimaryColor(): string {
  return resolvePrimaryColor(document);
}

export function resolvePrimaryColor(doc: Document): string {
  const raw = getComputedStyle(doc.documentElement)
    .getPropertyValue("--primary")
    .trim();

  if (!raw) {
    return "hsl(217.2 91.2% 59.8%)";
  }

  if (/^(oklch|oklab|hsl|hsla|rgb|rgba|lab|lch|color|#)/i.test(raw)) {
    return raw;
  }

  if (HSL_CHANNELS_RE.test(raw)) {
    return `hsl(${raw})`;
  }

  return raw;
}

export function getStageDropFeedbackCss(): string {
  return `
    [data-drop-zone] {
      position: relative;
    }

    [data-drop-zone].drop-active {
      border-radius: var(--radius-sm, 4px);
    }

    [data-aria-stage-content-root].drop-active {
      position: relative;
      border-radius: var(--radius-sm, 4px);
    }

    .drop-insertion-line {
      position: absolute;
      left: 0;
      right: 0;
      height: 3px;
      pointer-events: none;
      z-index: ${IFRAME_Z_INDEX.insertion};
      margin: -1px 0 0 0;
    }
  `;
}

export interface StageDragInlineStyles {
  outline: string;
  background: string;
  insetRing: string;
  insertionBackground: string;
  insertionBoxShadow: string;
}

export function getStageDragInlineStyles(
  doc: Document = document,
): StageDragInlineStyles {
  const primaryColor = resolvePrimaryColor(doc);
  const fill = `color-mix(in srgb, ${primaryColor} 12%, transparent)`;
  const ring = `color-mix(in srgb, ${primaryColor} 30%, transparent)`;

  return {
    outline: `2px solid ${primaryColor}`,
    background: fill,
    insetRing: `inset 0 0 0 1px ${ring}`,
    insertionBackground: primaryColor,
    insertionBoxShadow: `0 0 0 2px ${ring}, 0 1px 6px color-mix(in srgb, ${primaryColor} 35%, transparent)`,
  };
}

export function applyDropZoneActiveStyles(
  element: HTMLElement,
  doc: Document,
): void {
  if (DROP_ZONE_STYLE_SNAPSHOT.has(element)) {
    return;
  }

  DROP_ZONE_STYLE_SNAPSHOT.set(element, {
    outline: element.style.outline,
    outlineOffset: element.style.outlineOffset,
    backgroundColor: element.style.backgroundColor,
    boxShadow: element.style.boxShadow,
    borderColor: element.style.borderColor,
    position: element.style.position,
  });

  const styles = getStageDragInlineStyles(doc);
  const computedPosition = getComputedStyle(element).position;

  element.classList.add("drop-active");
  element.style.outline = styles.outline;
  element.style.outlineOffset = "0px";
  element.style.backgroundColor = styles.background;
  element.style.boxShadow = styles.insetRing;
  element.style.borderColor = styles.insertionBackground;

  if (computedPosition === "static") {
    element.style.position = "relative";
  }
}

export function clearDropZoneActiveStyles(element: HTMLElement): void {
  const snapshot = DROP_ZONE_STYLE_SNAPSHOT.get(element);
  element.classList.remove("drop-active");

  if (!snapshot) {
    return;
  }

  element.style.outline = snapshot.outline;
  element.style.outlineOffset = snapshot.outlineOffset;
  element.style.backgroundColor = snapshot.backgroundColor;
  element.style.boxShadow = snapshot.boxShadow;
  element.style.borderColor = snapshot.borderColor;
  element.style.position = snapshot.position;
  DROP_ZONE_STYLE_SNAPSHOT.delete(element);
}

export interface InsertionLinePosition {
  top: number;
  left: number;
  width: number;
}

export function createInsertionLineElement(
  doc: Document,
  position: InsertionLinePosition,
): HTMLDivElement {
  const styles = getStageDragInlineStyles(doc);
  const line = doc.createElement("div");
  line.className = "drop-insertion-line";

  Object.assign(line.style, {
    position: "absolute",
    left: `${position.left}px`,
    width: `${position.width}px`,
    top: `${position.top}px`,
    height: "3px",
    background: styles.insertionBackground,
    boxShadow: styles.insertionBoxShadow,
    pointerEvents: "none",
    zIndex: String(IFRAME_Z_INDEX.insertion),
  });

  return line;
}
