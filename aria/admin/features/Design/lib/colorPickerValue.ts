import { colord } from "colord";
import { z } from "zod";

import type { SemanticColors } from "../../../../lib/design/types";
import type { GlobalStyleVariables } from "../../../../lib/styles/universalDesignSystem";
import { toSerializedHex } from "./colorFormat";
import { resolvePaletteColorFromVariableKey } from "./designSystemColorVariables";
import type { VariableManagerPaletteLike } from "./variableManagerTokens";

const CSS_VARIABLE_REFERENCE_PATTERN =
  /^var\(--([a-zA-Z0-9-_]+)(?:\s*,\s*[^)]+)?\)$/;

const ColorPickerTokenPreviewOptionSchema = z
  .looseObject({
    value: z.string().trim().min(1),
    preview: z.string().trim().min(1),
  });

const ColorPickerTokenPreviewOptionListSchema = z.array(
  ColorPickerTokenPreviewOptionSchema,
);

type ColorPickerTokenPreviewOption = z.infer<
  typeof ColorPickerTokenPreviewOptionSchema
>;

export function extractCssVariableReferenceKey(
  rawValue: string,
): string | null {
  const matched = rawValue.trim().match(CSS_VARIABLE_REFERENCE_PATTERN);
  return matched?.[1] ?? null;
}

const BARE_VARIABLE_KEY_PATTERN = /^[a-z][a-z0-9-]*$/i;

export function createVariableReferenceFromKey(variableKey: string): string {
  const normalized = variableKey
    .trim()
    .replace(/^--+/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  return normalized ? `var(--${normalized})` : "";
}

/**
 * Normalizes RAW tab input into a stored color value (variable reference or hex).
 */
export function normalizeRawColorInput(
  value: string,
  options: { showAlpha?: boolean } = {},
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (extractCssVariableReferenceKey(trimmed) !== null) {
    return trimmed;
  }

  if (trimmed.startsWith("--")) {
    const reference = createVariableReferenceFromKey(trimmed);
    return reference || null;
  }

  if (
    BARE_VARIABLE_KEY_PATTERN.test(trimmed) &&
    !trimmed.startsWith("#") &&
    !colord(trimmed).isValid()
  ) {
    const reference = createVariableReferenceFromKey(trimmed);
    return reference || null;
  }

  const parsed = colord(trimmed);
  if (!parsed.isValid()) {
    return null;
  }

  return toSerializedHex(parsed, options.showAlpha ?? false);
}

function buildTokenPreviewMap(
  tokenOptions: readonly ColorPickerTokenPreviewOption[],
): Map<string, string> {
  const parsedOptions =
    ColorPickerTokenPreviewOptionListSchema.safeParse(tokenOptions);

  if (!parsedOptions.success) {
    return new Map<string, string>();
  }

  return new Map(
    parsedOptions.data.map((option) => [option.value, option.preview]),
  );
}

function resolveVariableColorValue(
  variableKey: string,
  variables: GlobalStyleVariables,
  tokenPreviewMap: Map<string, string>,
  visitedKeys: Set<string>,
): string | null {
  if (!variableKey || visitedKeys.has(variableKey)) {
    return null;
  }

  visitedKeys.add(variableKey);

  const customVariable = variables.custom[variableKey];
  if (customVariable) {
    const nestedReferenceKey = extractCssVariableReferenceKey(
      customVariable.value,
    );

    if (nestedReferenceKey) {
      return resolveVariableColorValue(
        nestedReferenceKey,
        variables,
        tokenPreviewMap,
        visitedKeys,
      );
    }

    return customVariable.value.trim() || null;
  }

  const alias = variables.aliases[variableKey];
  if (!alias) {
    return null;
  }

  if (alias.sourceType === "token") {
    return (
      tokenPreviewMap.get(alias.sourceKey) ?? alias.fallback?.trim() ?? null
    );
  }

  if (alias.sourceKey.trim().length > 0) {
    const resolvedSource = resolveVariableColorValue(
      alias.sourceKey,
      variables,
      tokenPreviewMap,
      visitedKeys,
    );

    if (resolvedSource) {
      return resolvedSource;
    }
  }

  return alias.fallback?.trim() || null;
}

export interface ColorPickerPreviewContext {
  palettes?: readonly VariableManagerPaletteLike[];
  semanticColors?: SemanticColors;
}

export function resolveColorPickerPreviewValue(
  rawValue: string,
  variables: GlobalStyleVariables,
  tokenOptions: readonly ColorPickerTokenPreviewOption[],
  context: ColorPickerPreviewContext = {},
): string | null {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }

  const referenceKey = extractCssVariableReferenceKey(trimmedValue);
  if (!referenceKey) {
    return trimmedValue;
  }

  if (context.palettes && context.semanticColors) {
    const fromDesignSystem = resolvePaletteColorFromVariableKey(
      referenceKey,
      context.palettes,
      context.semanticColors,
    );
    if (fromDesignSystem) {
      return fromDesignSystem;
    }
  }

  const tokenPreviewMap = buildTokenPreviewMap(tokenOptions);

  const fromGlobalStyles = resolveVariableColorValue(
    referenceKey,
    variables,
    tokenPreviewMap,
    new Set<string>(),
  );

  if (fromGlobalStyles) {
    return fromGlobalStyles;
  }

  // Fallback: when palette name lookup fails (palettes not yet loaded or name mismatch),
  // resolve via the token preview map which indexes the same palette data.
  // Construct token source keys matching buildVariableManagerTokenOptions format.
  // e.g. var(--primary-500) → referenceKey "primary-500" → token key "tokens.colors.palette.primary-500"
  const paletteTokenKey = `tokens.colors.palette.${referenceKey}`;
  const palettePreview = tokenPreviewMap.get(paletteTokenKey);
  if (palettePreview) {
    return palettePreview;
  }

  // Final fallback: direct alias lookup when all prior resolution paths fail.
  // This handles the case where the variable key itself is an alias key (e.g.
  // var(--aria-color-primary) where "aria-color-primary" is a token alias) but
  // resolveVariableColorValue didn't find it (e.g. due to a conflicting custom
  // variable with the same key, or a missing token preview map entry).
  const alias = variables.aliases[referenceKey];
  if (alias?.sourceType === "token") {
    return (
      tokenPreviewMap.get(alias.sourceKey) ?? alias.fallback?.trim() ?? null
    );
  }

  if (alias) {
    return alias.fallback?.trim() || null;
  }

  return null;
}
