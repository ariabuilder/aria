/**
 * Uses colord to generate full 25-950 shade scale from a single base
 * color. Supports both lightening (25-400) and darkening (600-950) from the base.
 */

import { colord, extend } from "colord";
import mixPlugin from "colord/plugins/mix";
import labPlugin from "colord/plugins/lab";
import lchPlugin from "colord/plugins/lch";
import a11yPlugin from "colord/plugins/a11y";
import type { ColorPaletteShades } from "./types";

// Extend colord with plugins for better color mixing and accessibility
extend([mixPlugin, labPlugin, lchPlugin, a11yPlugin]);

const PERCEPTUAL_SHADE_STOPS = [
  { shade: 25, lightness: 98, chroma: 0.1 },
  { shade: 50, lightness: 96, chroma: 0.16 },
  { shade: 100, lightness: 92, chroma: 0.28 },
  { shade: 200, lightness: 84, chroma: 0.48 },
  { shade: 300, lightness: 74, chroma: 0.68 },
  { shade: 400, lightness: 64, chroma: 0.86 },
  { shade: 500, lightness: 54, chroma: 1 },
  { shade: 600, lightness: 46, chroma: 0.96 },
  { shade: 700, lightness: 38, chroma: 0.88 },
  { shade: 800, lightness: 30, chroma: 0.76 },
  { shade: 900, lightness: 22, chroma: 0.6 },
  { shade: 950, lightness: 14, chroma: 0.42 },
] as const;

export interface PerceptualShadeOptions {
  /** Multiplier applied to the source color's CIELCH chroma. */
  chromaStrength?: number;
}

/**
 * Generate a stable 25-950 scale in CIELCH space. Numeric stops share
 * a fixed perceptual lightness curve while retaining the source hue.
 */
export function generatePerceptualShades(
  baseColor: string,
  options: PerceptualShadeOptions = {},
): ColorPaletteShades {
  const base = colord(baseColor);
  const lch = base.toLch();
  const chromaStrength = Math.max(0, options.chromaStrength ?? 1);
  const shades: Partial<ColorPaletteShades> = {};

  for (const stop of PERCEPTUAL_SHADE_STOPS) {
    shades[stop.shade] = colord({
      l: stop.lightness,
      c: lch.c * stop.chroma * chromaStrength,
      h: lch.h,
      a: lch.a,
    }).toHex();
  }

  shades.DEFAULT = base.toHex();
  return shades as ColorPaletteShades;
}

interface ShadeConfig {
  /** Lightness adjustment for each shade level */
  lightness: Record<number, number>;
  /** Saturation adjustment multiplier */
  saturationScale?: number;
}

/**
 * Default shade configuration
 * Standard color generation algorithm
 */
const DEFAULT_SHADE_CONFIG: ShadeConfig = {
  lightness: {
    25: 98,
    50: 95,
    100: 90,
    200: 80,
    300: 70,
    400: 60,
    500: 50, // Base
    600: 42,
    700: 34,
    800: 26,
    900: 18,
    950: 10,
  },
  saturationScale: 1,
};

/**
 * Generate full shade palette from a single base color
 *
 * @param baseColor - Hex color string (e.g., "#3b82f6")
 * @param config - Optional shade configuration
 * @returns Complete palette with 50-950 shades
 *
 * @example
 * ```typescript
 * const palette = generateShades("#3b82f6");
 * // { 25: "#f8fbff", 50: "#eff6ff", ..., 950: "#172554" }
 * ```
 */
export function generateShades(
  baseColor: string,
  config: ShadeConfig = DEFAULT_SHADE_CONFIG,
): ColorPaletteShades {
  const base = colord(baseColor);
  const hsl = base.toHsl();

  const shades: Partial<ColorPaletteShades> = {};

  for (const [shade, lightness] of Object.entries(config.lightness)) {
    const shadeNum = parseInt(shade, 10);

    // Create new color with adjusted lightness
    const newColor = colord({
      h: hsl.h,
      s: hsl.s * (config.saturationScale || 1),
      l: lightness,
    });

    shades[shadeNum as keyof ColorPaletteShades] = newColor.toHex();
  }

  // Set DEFAULT to 500
  shades.DEFAULT = shades[500];

  return shades as ColorPaletteShades;
}

/**
 * Generate shades with automatic saturation adjustment
 * Lighter shades get slightly less saturated, darker shades more
 *
 * @param baseColor - Hex color string
 * @returns Complete palette with natural-looking shades
 */
export function generateNaturalShades(baseColor: string): ColorPaletteShades {
  return generatePerceptualShades(baseColor);
}

/**
 * Generate grayscale/neutral palette
 *
 * @param warmth - 0 = pure gray, positive = warm, negative = cool
 * @returns Neutral palette
 */
export function generateNeutralShades(warmth: number = 0): ColorPaletteShades {
  const normalizedWarmth = Math.max(-1, Math.min(1, warmth));
  const anchor = colord({
    l: 54,
    c: Math.abs(normalizedWarmth) * 8,
    h: normalizedWarmth < 0 ? 255 : 65,
  }).toHex();

  return generatePerceptualShades(anchor, { chromaStrength: 0.12 });
}

export type ThemePaletteRole = "primary" | "secondary" | "muted" | "neutral";

/**
 * Neutral scale: owns shared whites (25–200) and blacks (800–950).
 * Mid tones anchor on the provided base.
 */
export function generateNeutralPalette(
  baseColor: string,
  warmth: number = 0,
): ColorPaletteShades {
  const base = colord(baseColor);
  const lch = base.toLch();
  const normalizedWarmth = Math.max(-1, Math.min(1, warmth));
  const hue = lch.c < 1 ? (normalizedWarmth < 0 ? 255 : 65) : lch.h;
  const neutralAnchor = colord({
    l: lch.l,
    c: Math.max(lch.c, Math.abs(normalizedWarmth) * 8),
    h: hue,
    a: lch.a,
  }).toHex();

  const scale = generatePerceptualShades(neutralAnchor, {
    chromaStrength: 0.12,
  });
  scale.DEFAULT = base.toHex();
  return scale;
}

/**
 * Brand palette: tints in the mids, extremes borrowed from neutral.
 */
export function generateBrandPalette(
  baseColor: string,
  _neutral: ColorPaletteShades,
  tintStrength: number,
): ColorPaletteShades {
  return generatePerceptualShades(baseColor, {
    chromaStrength: Math.max(0, tintStrength),
  });
}

/**
 * Muted palette: mostly neutral with a hint of the muted base in the mids.
 */
export function generateMutedPalette(
  baseColor: string,
  _neutral: ColorPaletteShades,
): ColorPaletteShades {
  return generatePerceptualShades(baseColor, { chromaStrength: 0.35 });
}

/**
 * Expand four template base colors into full design-system palettes.
 */
export function expandTemplateColorBases(
  bases: {
    primary: string;
    secondary: string;
    muted: string;
    neutral: string;
  },
  options?: { neutralWarmth?: number },
): Record<ThemePaletteRole, ColorPaletteShades> {
  const neutral = generateNeutralPalette(
    bases.neutral,
    options?.neutralWarmth ?? 0,
  );

  return {
    neutral,
    primary: generateBrandPalette(bases.primary, neutral, 1),
    secondary: generateBrandPalette(bases.secondary, neutral, 0.8),
    muted: generateMutedPalette(bases.muted, neutral),
  };
}

/**
 * Mix two colors to create a new shade
 *
 * @param color1 - First color
 * @param color2 - Second color
 * @param ratio - Mix ratio (0 = all color1, 1 = all color2)
 */
export function mixColors(
  color1: string,
  color2: string,
  ratio: number = 0.5,
): string {
  return colord(color1).mix(color2, ratio).toHex();
}

export function isLightColor(color: string): boolean {
  return colord(color).isLight();
}

/**
 * Get appropriate text color for a background
 */
export function getContrastText(backgroundColor: string): string {
  return isLightColor(backgroundColor) ? "#000000" : "#ffffff";
}

/** @deprecated Prefer `getContrastRatio` from `./colorContrast` (returns null for invalid). */
export { getContrastRatio } from "./colorContrast";

export function adjustBrightness(color: string, amount: number): string {
  const c = colord(color);
  return amount > 0
    ? c.lighten(amount).toHex()
    : c.darken(Math.abs(amount)).toHex();
}
