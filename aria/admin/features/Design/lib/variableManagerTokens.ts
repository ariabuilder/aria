import {
  COLOR_SHADES,
  type ColorPaletteShades,
  type SemanticColors,
} from "../../../../lib/design/types";
import type { GlobalStyleVariables } from "../../../../lib/styles/universalDesignSystem";

export interface VariableManagerPaletteLike {
  name: string;
  label: string;
  shades: ColorPaletteShades;
}

export interface VariableManagerTokenOption {
  value: string;
  label: string;
  meta: string;
  group: string;
  preview: string;
  suggestedKey: string;
  suggestedLabel: string;
}

function startCase(value: string): string {
  return value
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function normalizeCssVariableKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function paletteTokenSourceKey(
  paletteName: string,
  shade?: number,
): string {
  if (shade === undefined) {
    return `tokens.colors.palette.${paletteName}`;
  }

  return `tokens.colors.palette.${paletteName}-${shade}`;
}

export function semanticTokenSourceKey(
  semanticKey: string,
  shade?: number,
): string {
  if (shade === undefined) {
    return `tokens.colors.semantic.${semanticKey}`;
  }

  return `tokens.colors.semantic.${semanticKey}-${shade}`;
}

export function resolveTokenToVariableReference(
  variables: GlobalStyleVariables,
  tokenSourceKey: string,
): string | null {
  const aliasKey = findExistingTokenExposure(variables, tokenSourceKey);
  return aliasKey ? `var(--${aliasKey})` : null;
}

export function findExistingTokenExposure(
  variables: GlobalStyleVariables,
  sourceKey: string,
  excludeAliasKey?: string,
): string | null {
  for (const [aliasKey, alias] of Object.entries(variables.aliases)) {
    if (aliasKey === excludeAliasKey) {
      continue;
    }

    if (alias.sourceType === "token" && alias.sourceKey === sourceKey) {
      return aliasKey;
    }
  }

  return null;
}

export function findVariableKeyConflict(
  variables: GlobalStyleVariables,
  key: string,
  excludeAliasKey?: string,
): string | null {
  if (key in variables.custom) {
    return key;
  }

  if (key in variables.aliases && key !== excludeAliasKey) {
    return key;
  }

  return null;
}

export function ensureUniqueVariableKey(
  variables: GlobalStyleVariables,
  baseKey: string,
): string {
  const normalizedBaseKey = normalizeCssVariableKey(baseKey) || "token";
  let nextKey = normalizedBaseKey;
  let index = 2;

  while (findVariableKeyConflict(variables, nextKey)) {
    nextKey = `${normalizedBaseKey}-${index}`;
    index += 1;
  }

  return nextKey;
}

export function buildVariableManagerTokenOptions(
  palettes: readonly VariableManagerPaletteLike[],
  semanticColors: SemanticColors,
): VariableManagerTokenOption[] {
  const options: VariableManagerTokenOption[] = [];

  for (const palette of palettes) {
    const paletteLabel = palette.label.trim() || startCase(palette.name);
    const defaultColor = palette.shades.DEFAULT?.trim() || palette.shades[500];

    options.push({
      value: `tokens.colors.palette.${palette.name}`,
      label: paletteLabel,
      meta: `--${palette.name} · ${defaultColor}`,
      group: "Palette Tokens",
      preview: defaultColor,
      suggestedKey: normalizeCssVariableKey(palette.name),
      suggestedLabel: paletteLabel,
    });

    for (const shade of COLOR_SHADES) {
      const shadeColor = palette.shades[shade];
      options.push({
        value: `tokens.colors.palette.${palette.name}-${shade}`,
        label: `${paletteLabel} ${shade}`,
        meta: `--${palette.name}-${shade} · ${shadeColor}`,
        group: "Palette Tokens",
        preview: shadeColor,
        suggestedKey: normalizeCssVariableKey(`${palette.name}-${shade}`),
        suggestedLabel: `${paletteLabel} ${shade}`,
      });
    }
  }

  for (const [semanticKey, semanticColor] of Object.entries(semanticColors)) {
    const semanticLabel = startCase(semanticKey);
    options.push({
      value: `tokens.colors.semantic.${semanticKey}`,
      label: semanticLabel,
      meta: `--${semanticKey} · ${semanticColor}`,
      group: "Semantic Tokens",
      preview: semanticColor,
      suggestedKey: normalizeCssVariableKey(semanticKey),
      suggestedLabel: semanticLabel,
    });
  }

  return options;
}
