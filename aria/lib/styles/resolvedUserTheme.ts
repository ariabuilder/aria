import { z } from "zod";

import { buildDesignSystemColorCssVariables } from "../../admin/features/Design/lib/designSystemColorVariables";
import type { SiteSettings } from "../storage/adapter";
import type { UniversalDesignSystem } from "./universalDesignSystem";
import { createDesignSystemColorsFromUniversalDesignSystem } from "./universalDesignSystem";
import { serializeFontFamilyList } from "./fontFamily";

const UserThemeExtensionSchema = z
  .object({
    colors: z.record(z.string(), z.unknown()).optional(),
    fontFamily: z.record(z.string(), z.array(z.string())).optional(),
    fontSize: z.record(z.string(), z.string()).optional(),
    spacing: z.record(z.string(), z.string()).optional(),
    borderRadius: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export interface ResolvedUserTheme {
  paletteColors: Record<string, string>;
  unoThemeExtension: z.infer<typeof UserThemeExtensionSchema>;
  fontFamilies: {
    sans: string[];
    serif: string[];
    mono: string[];
  };
}

function resolvePaletteColors(
  designSystem: UniversalDesignSystem,
): Record<string, string> {
  const dsColors =
    createDesignSystemColorsFromUniversalDesignSystem(designSystem);
  const paletteColors: Record<string, string> = {};

  for (const [paletteName, shades] of Object.entries(dsColors.palettes)) {
    paletteColors[paletteName] = shades.DEFAULT ?? shades[500];
    for (const [shade, value] of Object.entries(shades)) {
      if (shade === "DEFAULT") continue;
      paletteColors[`${paletteName}-${shade}`] = value;
    }
  }

  return paletteColors;
}

function resolveFontFamilies(designSystem: UniversalDesignSystem): {
  sans: string[];
  serif: string[];
  mono: string[];
} {
  const body = designSystem.fonts.assignments.body || "system-ui";
  const heading = designSystem.fonts.assignments.heading || body;
  const mono = designSystem.fonts.assignments.mono || "monospace";

  return {
    sans: serializeFontFamilyList([body, "system-ui", "sans-serif"]),
    serif: serializeFontFamilyList([heading, "Georgia", "serif"]),
    mono: serializeFontFamilyList([mono, "Consolas", "monospace"]),
  };
}

export function resolveUserTheme(
  designSystem: UniversalDesignSystem,
  siteSettings: SiteSettings | null,
): ResolvedUserTheme {
  const unoThemeExtension = UserThemeExtensionSchema.parse(
    siteSettings?.unocssConfig?.theme ?? {},
  );

  return {
    paletteColors: resolvePaletteColors(designSystem),
    unoThemeExtension,
    fontFamilies: resolveFontFamilies(designSystem),
  };
}

export function buildResolvedThemeCssVariables(
  designSystem: UniversalDesignSystem,
  _siteSettings: SiteSettings | null,
): Record<string, string> {
  return buildDesignSystemColorCssVariables(designSystem);
}
