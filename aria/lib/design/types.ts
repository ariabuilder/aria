/**
 * Core types for the color system, palette templates, and design token management.
 */

import { z } from "zod";

/**
 * Standard color shade levels (UnoCSS convention)
 */
export const COLOR_SHADES = [
  25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;
export type ColorShade = (typeof COLOR_SHADES)[number];

/**
 * Shade value schema
 */
export const ColorShadeSchema = z.enum([
  "25",
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
]);

export interface ColorPaletteShades {
  25: string;
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
  DEFAULT?: string; // Usually 500
}

export const ColorPaletteShadesSchema = z.object({
  25: z.string(),
  50: z.string(),
  100: z.string(),
  200: z.string(),
  300: z.string(),
  400: z.string(),
  500: z.string(),
  600: z.string(),
  700: z.string(),
  800: z.string(),
  900: z.string(),
  950: z.string(),
  DEFAULT: z.string().optional(),
});

export interface ColorPalette {
  id: string;
  /** Display name (e.g., "Primary", "Brand Blue") */
  name: string;
  shades: ColorPaletteShades;
  /** Is this a user-created palette? */
  isCustom?: boolean;
  description?: string;
}

export const ColorPaletteSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shades: ColorPaletteShadesSchema,
  isCustom: z.boolean().optional(),
  description: z.string().optional(),
});

/**
 * Semantic color definitions
 */
export interface SemanticColors {
  success: string;
  warning: string;
  error: string;
  info: string;
}

export const SemanticColorsSchema = z.object({
  success: z.string(),
  warning: z.string(),
  error: z.string(),
  info: z.string(),
});

/**
 * Four semantic base colors per theme; full shade scales are generated on apply.
 */
export interface TemplateColorBases {
  /** Brand / interactive */
  primary: string;
  /** Supporting brand tone */
  secondary: string;
  /** Subtle text, borders, placeholders */
  muted: string;
  /** Mid neutral; scale owns shared whites and blacks */
  neutral: string;
}

export const TemplateColorBasesSchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  muted: z.string(),
  neutral: z.string(),
});

export interface PaletteTemplate {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  /** Four base colors expanded into full palettes on apply */
  colors: TemplateColorBases;
  /**
   * Cool/warm bias for neutral scale generation (-1 cool … 1 warm).
   * Ignored when all four bases are explicit (e.g. minimal).
   */
  neutralWarmth?: number;
  semantic: SemanticColors;
  /** Preview colors for template selector UI */
  preview?: string[];
}

export const PaletteTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  isBuiltIn: z.boolean(),
  colors: TemplateColorBasesSchema,
  neutralWarmth: z.number().optional(),
  semantic: SemanticColorsSchema,
  preview: z.array(z.string()).optional(),
});

/**
 * Complete design system color configuration
 * This is what gets saved to site settings
 */
export interface DesignSystemColors {
  activeTemplateId: string;
  /** All color palettes (keyed by name) */
  palettes: Record<string, ColorPaletteShades>;
  semantic: SemanticColors;
  customPalettes?: ColorPalette[];
  /** Backward-compatible CSS variable aliases for renamed/deleted palettes */
  paletteAliases?: Record<string, string>;
}

export const DesignSystemColorsSchema = z.object({
  activeTemplateId: z.string(),
  palettes: z.record(z.string(), ColorPaletteShadesSchema),
  semantic: SemanticColorsSchema,
  customPalettes: z.array(ColorPaletteSchema).optional(),
  paletteAliases: z.record(z.string(), z.string()).optional(),
});

export interface DesignSystemExport {
  exportedAt: string;
  name?: string;
  colors: DesignSystemColors;
}

export const DesignSystemExportSchema = z.object({
  exportedAt: z.string(),
  name: z.string().optional(),
  colors: DesignSystemColorsSchema,
});

export type UnoThemeColors = Record<string, ColorPaletteShades | string>;

/**
 * CSS variables format
 */
export type CSSVariables = Record<string, string>;
