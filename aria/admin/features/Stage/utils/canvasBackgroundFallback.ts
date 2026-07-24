const TRANSPARENT_BACKGROUND_VALUES = new Set([
  "",
  "transparent",
  "rgba(0, 0, 0, 0)",
  "rgba(0,0,0,0)",
]);

export const CANVAS_BODY_BACKGROUND_FALLBACK =
  "var(--color-background, #ffffff)";

export type CanvasBackgroundStyleSnapshot = {
  backgroundColor: string;
  backgroundImage: string;
};

const AUTHORED_CANVAS_BACKGROUND_RE =
  /(?:^|}|;)\s*(?:html\s*,\s*body|body\s*,\s*html|html|body)\s*\{[^}]*background(?:-color|-image)?\s*:/i;

function hasVisibleBackground(style: CanvasBackgroundStyleSnapshot): boolean {
  const backgroundColor = style.backgroundColor.trim().toLowerCase();
  const backgroundImage = style.backgroundImage.trim().toLowerCase();

  if (backgroundImage && backgroundImage !== "none") {
    return true;
  }

  return !TRANSPARENT_BACKGROUND_VALUES.has(backgroundColor);
}

export function resolveCanvasBodyBackground(input: {
  computedStyle: CanvasBackgroundStyleSnapshot;
  rootComputedStyle?: CanvasBackgroundStyleSnapshot;
  authoredCssText?: string;
  fallbackValue?: string;
}): {
  background: string | null;
  usedFallback: boolean;
} {
  if (hasAuthoredCanvasBackgroundCss(input.authoredCssText)) {
    return { background: null, usedFallback: false };
  }

  if (hasVisibleBackground(input.computedStyle)) {
    return { background: null, usedFallback: false };
  }

  if (
    input.rootComputedStyle &&
    hasVisibleBackground(input.rootComputedStyle)
  ) {
    return { background: null, usedFallback: false };
  }

  return {
    background: input.fallbackValue ?? CANVAS_BODY_BACKGROUND_FALLBACK,
    usedFallback: true,
  };
}

export function hasAuthoredCanvasBackgroundCss(cssText?: string): boolean {
  if (!cssText) {
    return false;
  }

  return AUTHORED_CANVAS_BACKGROUND_RE.test(cssText);
}
