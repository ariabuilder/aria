import {
  COLOR_SHADES,
  type ColorPaletteShades,
  type SemanticColors,
} from "../../../../lib/design/types";
import type { UniversalDesignSystem } from "../../../../lib/styles/universalDesignSystem";
import { createDesignSystemColorsFromUniversalDesignSystem } from "../../../../lib/styles/universalDesignSystem";
import { generateNaturalShades } from "../../../../lib/design/shades";
import type { GlobalStyleVariables } from "../../../../lib/styles/universalDesignSystem";
import {
  findExistingTokenExposure,
  type VariableManagerPaletteLike,
} from "./variableManagerTokens";

/** CSS variable slug for each semantic design token (matches Color System UI). */
export const SEMANTIC_CSS_VAR_BY_KEY: Record<
  keyof SemanticColors,
  string
> = {
  success: "success",
  warning: "warning",
  error: "destructive",
  info: "info",
};

const SEMANTIC_KEY_BY_CSS_VAR = Object.fromEntries(
  Object.entries(SEMANTIC_CSS_VAR_BY_KEY).map(([key, cssVar]) => [
    cssVar,
    key as keyof SemanticColors,
  ]),
) as Record<string, keyof SemanticColors>;

const COLOR_SHADE_SET = new Set<number>(COLOR_SHADES);

export function paletteCssVariableKey(
  paletteName: string,
  shade?: number,
): string {
  if (shade === undefined) {
    return paletteName;
  }

  return `${paletteName}-${shade}`;
}

export function createPaletteVariableReference(
  paletteName: string,
  shade?: number,
): string {
  return `var(--${paletteCssVariableKey(paletteName, shade)})`;
}

export function createSemanticVariableReference(
  semanticKey: keyof SemanticColors | string,
  shade?: number,
): string {
  const cssKey =
    SEMANTIC_CSS_VAR_BY_KEY[semanticKey as keyof SemanticColors] ??
    String(semanticKey);

  if (shade === undefined) {
    return `var(--${cssKey})`;
  }

  return `var(--${cssKey}-${shade})`;
}

function getPaletteShadeHex(
  shades: ColorPaletteShades,
  shade?: number,
): string | null {
  if (shade === undefined) {
    const base = shades.DEFAULT?.trim() || shades[500]?.trim();
    return base || null;
  }

  const shadeValue = shades[shade as keyof ColorPaletteShades];
  return typeof shadeValue === "string" && shadeValue.trim().length > 0
    ? shadeValue.trim()
    : null;
}

function parsePaletteVariableKey(
  variableKey: string,
): { paletteName: string; shade?: number } | null {
  const legacyMatch = variableKey.match(/^color-([a-z0-9-]+?)(?:-(\d+))?$/);
  const key = legacyMatch ? legacyMatch[1] : variableKey;
  const shadePart = legacyMatch ? legacyMatch[2] : undefined;

  if (!key) {
    return null;
  }

  const shadeMatch = key.match(/^([a-z0-9-]+)-(\d+)$/);
  if (shadeMatch) {
    const shade = Number(shadeMatch[2]);
    if (COLOR_SHADE_SET.has(shade)) {
      return { paletteName: shadeMatch[1], shade };
    }
  }

  if (shadePart && COLOR_SHADE_SET.has(Number(shadePart))) {
    return { paletteName: key, shade: Number(shadePart) };
  }

  return { paletteName: key };
}

function parseSemanticVariableKey(
  variableKey: string,
): { semanticKey: keyof SemanticColors; shade?: number } | null {
  const semanticCssVar = variableKey in SEMANTIC_KEY_BY_CSS_VAR
    ? variableKey
    : null;

  if (semanticCssVar) {
    return { semanticKey: SEMANTIC_KEY_BY_CSS_VAR[semanticCssVar] };
  }

  for (const [cssVar, semanticKey] of Object.entries(SEMANTIC_KEY_BY_CSS_VAR)) {
    const prefix = `${cssVar}-`;
    if (!variableKey.startsWith(prefix)) {
      continue;
    }

    const shade = Number(variableKey.slice(prefix.length));
    if (COLOR_SHADE_SET.has(shade)) {
      return { semanticKey, shade };
    }
  }

  for (const semanticKey of Object.keys(SEMANTIC_CSS_VAR_BY_KEY) as Array<
    keyof SemanticColors
  >) {
    const prefix = `${semanticKey}-`;
    if (!variableKey.startsWith(prefix)) {
      continue;
    }

    const shade = Number(variableKey.slice(prefix.length));
    if (COLOR_SHADE_SET.has(shade)) {
      return { semanticKey, shade };
    }
  }

  return null;
}

export function resolvePaletteColorFromVariableKey(
  variableKey: string,
  palettes: readonly VariableManagerPaletteLike[],
  semanticColors: SemanticColors,
): string | null {
  const semanticParsed = parseSemanticVariableKey(variableKey);
  if (semanticParsed) {
    const baseColor = semanticColors[semanticParsed.semanticKey]?.trim();
    if (!baseColor) {
      return null;
    }

    if (semanticParsed.shade === undefined) {
      return baseColor;
    }

    const generated = generateNaturalShades(baseColor);
    return getPaletteShadeHex(generated, semanticParsed.shade);
  }

  const paletteParsed = parsePaletteVariableKey(variableKey);
  if (!paletteParsed) {
    return null;
  }

  const palette = palettes.find(
    (entry) => entry.name === paletteParsed.paletteName,
  );
  if (!palette) {
    return null;
  }

  return getPaletteShadeHex(palette.shades, paletteParsed.shade);
}

export interface ResolveDesignColorAssignmentOptions {
  variables: GlobalStyleVariables;
  palettes: readonly VariableManagerPaletteLike[];
  semanticColors: SemanticColors;
  tokenSourceKey: string;
  paletteName?: string;
  shade?: number;
  semanticKey?: keyof SemanticColors | string;
  fallbackColor: string;
}

export function resolveDesignColorAssignmentValue(
  options: ResolveDesignColorAssignmentOptions,
): string {
  const aliasKey = findExistingTokenExposure(
    options.variables,
    options.tokenSourceKey,
  );
  if (aliasKey) {
    return `var(--${aliasKey})`;
  }

  if (options.paletteName) {
    return createPaletteVariableReference(
      options.paletteName,
      options.shade,
    );
  }

  if (options.semanticKey) {
    return createSemanticVariableReference(
      options.semanticKey,
      options.shade,
    );
  }

  return options.fallbackColor.trim();
}

export function buildDesignSystemColorCssVariables(
  designSystem: UniversalDesignSystem,
): Record<string, string> {
  const dsColors =
    createDesignSystemColorsFromUniversalDesignSystem(designSystem);
  const variables: Record<string, string> = {};

  for (const [paletteName, shades] of Object.entries(dsColors.palettes)) {
    const baseColor = shades.DEFAULT?.trim() || shades[500]?.trim();
    if (baseColor) {
      variables[`--${paletteName}`] = baseColor;
    }

    for (const shade of COLOR_SHADES) {
      const shadeColor = shades[shade]?.trim();
      if (shadeColor) {
        variables[`--${paletteName}-${shade}`] = shadeColor;
      }
    }
  }

  for (const [aliasKey, aliasValue] of Object.entries(
    dsColors.paletteAliases ?? {},
  )) {
    const normalizedKey = aliasKey.trim();
    const normalizedValue = aliasValue.trim();
    if (!normalizedKey || !normalizedValue) {
      continue;
    }

    if (variables[`--${normalizedKey}`]) {
      continue;
    }

    variables[`--${normalizedKey}`] = normalizedValue;
  }

  for (const semanticKey of Object.keys(SEMANTIC_CSS_VAR_BY_KEY) as Array<
    keyof SemanticColors
  >) {
    const baseColor = dsColors.semantic[semanticKey]?.trim();
    const cssVar = SEMANTIC_CSS_VAR_BY_KEY[semanticKey];
    if (!baseColor || !cssVar) {
      continue;
    }

    variables[`--${cssVar}`] = baseColor;

    const generated = generateNaturalShades(baseColor);
    for (const shade of COLOR_SHADES) {
      const shadeColor = generated[shade]?.trim();
      if (shadeColor) {
        variables[`--${cssVar}-${shade}`] = shadeColor;
      }
    }
  }

  return variables;
}

export function designSwatchAssignmentLabel(
  assignmentValue: string,
  fallbackHex: string,
): string {
  if (assignmentValue.startsWith("var(--")) {
    return `${assignmentValue} · ${fallbackHex}`;
  }

  return fallbackHex;
}
