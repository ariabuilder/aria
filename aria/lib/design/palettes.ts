/**
 * Each template defines four base colors (primary, secondary, muted, neutral). Full 25–950
 * scales are generated on apply; neutral owns shared whites and blacks.
 */

import type {
  PaletteTemplate,
  ColorPaletteShades,
  SemanticColors,
  TemplateColorBases,
} from "./types";
import {
  expandTemplateColorBases,
  generateNeutralPalette,
  mixColors,
} from "./shades";

const DEFAULT_SEMANTIC: SemanticColors = {
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
};

interface ThemeTemplateOptions {
  id: string;
  name: string;
  description: string;
  colors: TemplateColorBases;
  neutralWarmth?: number;
  semantic?: Partial<SemanticColors>;
}

function buildThemeTemplate(opts: ThemeTemplateOptions): PaletteTemplate {
  const { colors } = opts;
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    isBuiltIn: true,
    colors,
    neutralWarmth: opts.neutralWarmth,
    semantic: { ...DEFAULT_SEMANTIC, ...opts.semantic },
    preview: [colors.primary, colors.secondary, colors.muted, colors.neutral],
  };
}

function buildGroundedTheme(opts: {
  id: string;
  name: string;
  description: string;
  primary: string;
  secondary: string;
  muted: string;
  neutralWarmth: number;
  semantic?: Partial<SemanticColors>;
}): PaletteTemplate {
  const neutralMid = generateNeutralPalette(
    mixColors(opts.primary, "#808080", 0.65),
    opts.neutralWarmth,
  )[500];

  return buildThemeTemplate({
    id: opts.id,
    name: opts.name,
    description: opts.description,
    neutralWarmth: opts.neutralWarmth,
    colors: {
      primary: opts.primary,
      secondary: opts.secondary,
      muted: opts.muted,
      neutral: neutralMid,
    },
    semantic: opts.semantic,
  });
}

const MINIMAL_GRAY = "#71717a";

const MINIMAL_TEMPLATE = buildThemeTemplate({
  id: "minimal",
  name: "Minimal",
  description:
    "Clean neutral grayscale — a blank slate for custom brand colors",
  colors: {
    primary: MINIMAL_GRAY,
    secondary: MINIMAL_GRAY,
    muted: "#a1a1aa",
    neutral: MINIMAL_GRAY,
  },
  neutralWarmth: 0,
  semantic: {
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    info: MINIMAL_GRAY,
  },
});

const MODERN_BLUE_TEMPLATE = buildGroundedTheme({
  id: "modern-blue",
  name: "Modern Blue",
  description:
    "Balanced product blue with cool neutrals — suited to SaaS and tech",
  primary: "#3d6fae",
  secondary: "#5a7a9e",
  muted: "#8b9cb0",
  neutralWarmth: -0.2,
});

const SAGE_TEMPLATE = buildGroundedTheme({
  id: "sage",
  name: "Sage",
  description:
    "Restrained green with warm stone neutrals — health, wellness, and eco",
  primary: "#4d7c6a",
  secondary: "#6b7c5c",
  muted: "#8a9a8f",
  neutralWarmth: 0.15,
  semantic: {
    success: "#4d7c6a",
  },
});

const CLAY_TEMPLATE = buildGroundedTheme({
  id: "clay",
  name: "Clay",
  description:
    "Warm terracotta and umber tones — editorial sites and human-centered brands",
  primary: "#b07a5f",
  secondary: "#7a5c4a",
  muted: "#a89488",
  neutralWarmth: 0.25,
  semantic: {
    warning: "#b07a5f",
  },
});

const INK_TEMPLATE = buildGroundedTheme({
  id: "ink",
  name: "Ink",
  description:
    "Blue-gray primary with a soft violet secondary — modern tech and studios",
  primary: "#4f5d7a",
  secondary: "#6b5f8a",
  muted: "#8b92a3",
  neutralWarmth: -0.15,
  semantic: {
    info: "#4f5d7a",
  },
});

const SLOP_PURPLE_TEMPLATE = buildThemeTemplate({
  id: "slop-purple",
  name: "Slop Purple",
  description:
    "The generic AI landing-page gradient. Purple, pink, and cyan. You know the one.",
  colors: {
    primary: "#8b5cf6",
    secondary: "#d946ef",
    muted: "#94a3b8",
    neutral: "#475569",
  },
  neutralWarmth: -0.15,
  semantic: {
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#8b5cf6",
  },
});

// EXPAND TEMPLATE → FULL PALETTES

export type ThemePaletteName = "primary" | "secondary" | "muted" | "neutral";

/**
 * Expand a template's four base colors into full shade palettes for persistence.
 */
export function expandTemplateToPalettes(
  template: PaletteTemplate,
): Record<ThemePaletteName, ColorPaletteShades> {
  return expandTemplateColorBases(template.colors, {
    neutralWarmth: template.neutralWarmth,
  });
}

export const PALETTE_TEMPLATES: Record<string, PaletteTemplate> = {
  minimal: MINIMAL_TEMPLATE,
  "modern-blue": MODERN_BLUE_TEMPLATE,
  sage: SAGE_TEMPLATE,
  clay: CLAY_TEMPLATE,
  ink: INK_TEMPLATE,
  "slop-purple": SLOP_PURPLE_TEMPLATE,
};

export const REMOVED_TEMPLATE_IDS = new Set([
  "forest",
  "sunset",
  "purple-haze",
  "graphite",
]);

export function normalizeTemplateId(id: string | undefined): string {
  if (!id || REMOVED_TEMPLATE_IDS.has(id)) return "custom";
  if (!PALETTE_TEMPLATES[id]) return "custom";
  return id;
}

export const TEMPLATE_IDS = Object.keys(PALETTE_TEMPLATES) as string[];

export function getTemplate(id: string): PaletteTemplate | undefined {
  return PALETTE_TEMPLATES[id];
}

export function getDefaultTemplate(): PaletteTemplate {
  return MODERN_BLUE_TEMPLATE;
}

export function getMinimalTemplate(): PaletteTemplate {
  return MINIMAL_TEMPLATE;
}

export function templateToUnoColors(
  template: PaletteTemplate,
): Record<string, ColorPaletteShades | string> {
  const palettes = expandTemplateToPalettes(template);
  return {
    primary: palettes.primary,
    secondary: palettes.secondary,
    muted: palettes.muted,
    neutral: palettes.neutral,
    success: template.semantic.success,
    warning: template.semantic.warning,
    error: template.semantic.error,
    info: template.semantic.info,
  };
}

export function templateToCSSVariables(
  template: PaletteTemplate,
): Record<string, string> {
  const palettes = expandTemplateToPalettes(template);
  const variables: Record<string, string> = {};

  for (const role of ["primary", "secondary", "muted", "neutral"] as const) {
    const palette = palettes[role];
    for (const [shade, value] of Object.entries(palette)) {
      if (shade !== "DEFAULT") {
        variables[`--color-${role}-${shade}`] = value;
      }
    }
    variables[`--color-${role}`] = palette.DEFAULT || palette[500];
  }

  variables["--color-success"] = template.semantic.success;
  variables["--color-warning"] = template.semantic.warning;
  variables["--color-error"] = template.semantic.error;
  variables["--color-info"] = template.semantic.info;

  // Legacy alias for sites still referencing accent tokens
  variables["--color-accent"] =
    palettes.secondary.DEFAULT || palettes.secondary[500];

  return variables;
}
