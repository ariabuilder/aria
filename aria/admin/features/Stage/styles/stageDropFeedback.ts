/**
 * Theme-aware color resolution for host-owned canvas overlays.
 */

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
