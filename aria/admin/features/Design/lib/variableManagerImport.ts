import { z } from "zod";

import {
  createDefaultGlobalStylesConfig,
  GLOBAL_STYLE_VARIABLE_CATEGORIES,
  GlobalStyleVariablesSchema,
  type GlobalStyleVariableAlias,
  type GlobalStyleVariableCategory,
  type GlobalStyleVariableDefinition,
  type GlobalStyleVariables,
} from "../../../../lib/styles/universalDesignSystem";
import {
  ensureUniqueVariableKey,
  normalizeCssVariableKey,
} from "./variableManagerTokens";

const CSS_VARIABLE_DECLARATION_PATTERN = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);?/g;
const CSS_VARIABLE_REFERENCE_PATTERN =
  /^var\(\s*--([a-zA-Z0-9-_]+)\s*(?:,\s*(.+))?\)$/i;

const ImportedCssVariableSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string().trim().min(1),
});

export interface VariableImportParseSuccess {
  success: true;
  data: GlobalStyleVariables;
  summary: {
    customCount: number;
    aliasCount: number;
    totalCount: number;
  };
}

export interface VariableImportParseFailure {
  success: false;
  error: string;
}

export type VariableImportParseResult =
  | VariableImportParseSuccess
  | VariableImportParseFailure;

export const VariableImportModeSchema = z.enum(["merge", "replace"]);

export type VariableImportMode = z.infer<typeof VariableImportModeSchema>;

const VariableImportCategorySchema = z.enum(GLOBAL_STYLE_VARIABLE_CATEGORIES);

function startCase(value: string): string {
  return value
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function inferVariableCategory(
  key: string,
  value: string,
): GlobalStyleVariableCategory {
  const normalizedKey = key.toLowerCase();
  const normalizedValue = value.toLowerCase();

  if (
    /(color|bg|background|text|border|fill|stroke)/.test(normalizedKey) ||
    /^(#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|color\()/.test(
      normalizedValue,
    )
  ) {
    return "color";
  }

  if (/(space|gap|padding|margin|inset)/.test(normalizedKey)) {
    return "spacing";
  }

  if (
    /(font|text|type|line-height|letter-spacing|leading)/.test(normalizedKey)
  ) {
    return "typography";
  }

  if (/(radius|border|outline|stroke-width)/.test(normalizedKey)) {
    return "borders";
  }

  if (/(shadow|blur|opacity|filter)/.test(normalizedKey)) {
    return "effects";
  }

  if (
    /(width|height|max|min|layout|container|section|grid|column)/.test(
      normalizedKey,
    )
  ) {
    return "layout";
  }

  return "other";
}

function buildFallbackLabel(key: string): string {
  return startCase(key) || key;
}

function sanitizeCustomDefinition(
  key: string,
  definition: GlobalStyleVariableDefinition,
): GlobalStyleVariableDefinition {
  const parsedCategory = VariableImportCategorySchema.safeParse(
    definition.category,
  );

  return {
    label: definition.label.trim() || buildFallbackLabel(key),
    value: typeof definition.value === "string" ? definition.value : "",
    category: parsedCategory.success ? parsedCategory.data : "other",
    description:
      typeof definition.description === "string" ? definition.description : "",
  };
}

function normalizeAliasSourceKey(
  sourceType: GlobalStyleVariableAlias["sourceType"],
  sourceKey: string,
): string {
  const trimmedSourceKey = sourceKey.trim();
  if (!trimmedSourceKey) {
    return "";
  }

  if (sourceType === "token") {
    return trimmedSourceKey;
  }

  return normalizeCssVariableKey(trimmedSourceKey);
}

function sanitizeAliasDefinition(
  key: string,
  alias: GlobalStyleVariableAlias,
): GlobalStyleVariableAlias | null {
  const sourceType = alias.sourceType === "token" ? "token" : "custom";
  const sourceKey =
    typeof alias.sourceKey === "string"
      ? normalizeAliasSourceKey(sourceType, alias.sourceKey)
      : "";

  if (!sourceKey) {
    return null;
  }

  return {
    label: alias.label.trim() || buildFallbackLabel(key),
    sourceType,
    sourceKey,
    fallback: typeof alias.fallback === "string" ? alias.fallback : "",
  };
}

function sanitizeVariableSet(
  variables: GlobalStyleVariables,
): GlobalStyleVariables {
  const nextVariables: GlobalStyleVariables = {
    custom: {},
    aliases: {},
  };

  for (const [key, definition] of Object.entries(variables.custom)) {
    nextVariables.custom[key] = sanitizeCustomDefinition(key, definition);
  }

  for (const [key, alias] of Object.entries(variables.aliases)) {
    const sanitizedAlias = sanitizeAliasDefinition(key, alias);
    if (!sanitizedAlias) {
      continue;
    }

    nextVariables.aliases[key] = sanitizedAlias;
  }

  return nextVariables;
}

function parseImportedCssVariables(
  input: string,
): Array<{ key: string; value: string }> {
  const matches: Array<{ key: string; value: string }> = [];

  for (const match of input.matchAll(CSS_VARIABLE_DECLARATION_PATTERN)) {
    const parsedMatch = ImportedCssVariableSchema.safeParse({
      key: normalizeCssVariableKey(match[1] ?? ""),
      value: match[2]?.trim() ?? "",
    });

    if (!parsedMatch.success) {
      continue;
    }

    matches.push(parsedMatch.data);
  }

  return matches;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceVariableSet(value: unknown): GlobalStyleVariables | null {
  if (!isRecord(value)) {
    return null;
  }

  const custom = isRecord(value.custom) ? value.custom : {};
  const aliases = isRecord(value.aliases) ? value.aliases : {};

  if (Object.keys(custom).length === 0 && Object.keys(aliases).length === 0) {
    return null;
  }

  return {
    custom: custom as GlobalStyleVariables["custom"],
    aliases: aliases as GlobalStyleVariables["aliases"],
  };
}

function extractVariableImportPayload(parsed: unknown): {
  variables: GlobalStyleVariables;
  name: string | null;
} | null {
  if (!isRecord(parsed)) {
    return null;
  }

  const directVariables = coerceVariableSet(parsed);
  if (directVariables) {
    return {
      variables: directVariables,
      name: typeof parsed.name === "string" ? parsed.name.trim() || null : null,
    };
  }

  if (isRecord(parsed.variables)) {
    const wrappedVariables = coerceVariableSet(parsed.variables);
    if (wrappedVariables) {
      return {
        variables: wrappedVariables,
        name:
          typeof parsed.name === "string" ? parsed.name.trim() || null : null,
      };
    }
  }

  if (
    isRecord(parsed.globalStyles) &&
    isRecord(parsed.globalStyles.variables)
  ) {
    const designSystemVariables = coerceVariableSet(parsed.globalStyles.variables);
    if (designSystemVariables) {
      return {
        variables: designSystemVariables,
        name:
          typeof parsed.name === "string" ? parsed.name.trim() || null : null,
      };
    }
  }

  return null;
}

function buildVariableImportSummary(
  variables: GlobalStyleVariables,
): VariableImportParseSuccess["summary"] {
  const customCount = Object.keys(variables.custom).length;
  const aliasCount = Object.keys(variables.aliases).length;

  return {
    customCount,
    aliasCount,
    totalCount: customCount + aliasCount,
  };
}

export function parseVariableImportJson(
  input: string,
): VariableImportParseResult {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    return {
      success: false,
      error: "Paste or upload a JSON file with variables and aliases.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmedInput);
  } catch {
    return {
      success: false,
      error: "Invalid JSON syntax.",
    };
  }

  const extracted = extractVariableImportPayload(parsed);
  if (!extracted) {
    return {
      success: false,
      error:
        'JSON must contain a "custom" or "aliases" object, or a wrapped "variables" / "globalStyles.variables" export.',
    };
  }

  const sanitizedVariables = sanitizeVariableSet(extracted.variables);
  const parsedVariables = GlobalStyleVariablesSchema.safeParse(sanitizedVariables);

  if (!parsedVariables.success) {
    return {
      success: false,
      error:
        parsedVariables.error.issues[0]?.message ??
        "Imported variables are invalid.",
    };
  }

  return {
    success: true,
    data: parsedVariables.data,
    summary: buildVariableImportSummary(parsedVariables.data),
  };
}

export function parseVariableImportInput(
  input: string,
): VariableImportParseResult {
  const matches = parseImportedCssVariables(input);

  if (matches.length === 0) {
    return {
      success: false,
      error:
        "No CSS custom properties found. Paste declarations like --brand-primary: #2d49b7;",
    };
  }

  const custom: Record<string, GlobalStyleVariableDefinition> = {};
  const aliases: Record<string, GlobalStyleVariableAlias> = {};

  for (const match of matches) {
    const referenceMatch = match.value.match(CSS_VARIABLE_REFERENCE_PATTERN);

    if (referenceMatch) {
      aliases[match.key] = {
        label: startCase(match.key),
        sourceType: "custom",
        sourceKey: normalizeCssVariableKey(referenceMatch[1] ?? ""),
        fallback: referenceMatch[2]?.trim() ?? "",
      };
      continue;
    }

    custom[match.key] = {
      label: startCase(match.key),
      value: match.value,
      category: inferVariableCategory(match.key, match.value),
      description: "",
    };
  }

  const parsedVariables = GlobalStyleVariablesSchema.safeParse({
    custom,
    aliases,
  });

  if (!parsedVariables.success) {
    return {
      success: false,
      error:
        parsedVariables.error.issues[0]?.message ??
        "Imported variables are invalid.",
    };
  }

  return {
    success: true,
    data: parsedVariables.data,
    summary: {
      customCount: Object.keys(parsedVariables.data.custom).length,
      aliasCount: Object.keys(parsedVariables.data.aliases).length,
      totalCount:
        Object.keys(parsedVariables.data.custom).length +
        Object.keys(parsedVariables.data.aliases).length,
    },
  };
}

export function mergeImportedVariableSet(
  baseVariables: GlobalStyleVariables,
  importedVariables: GlobalStyleVariables,
): GlobalStyleVariables {
  const sanitizedBaseVariables = sanitizeVariableSet(baseVariables);
  const nextVariables: GlobalStyleVariables = {
    custom: { ...sanitizedBaseVariables.custom },
    aliases: { ...sanitizedBaseVariables.aliases },
  };
  const importedCustomKeyMap = new Map<string, string>();

  for (const [key, definition] of Object.entries(importedVariables.custom)) {
    const nextKey = ensureUniqueVariableKey(nextVariables, key);
    nextVariables.custom[nextKey] = { ...definition };
    importedCustomKeyMap.set(key, nextKey);
  }

  for (const [key, alias] of Object.entries(importedVariables.aliases)) {
    const nextKey = ensureUniqueVariableKey(nextVariables, key);
    const nextAlias: GlobalStyleVariableAlias = { ...alias };

    if (
      nextAlias.sourceType === "custom" &&
      importedCustomKeyMap.has(nextAlias.sourceKey)
    ) {
      nextAlias.sourceKey =
        importedCustomKeyMap.get(nextAlias.sourceKey) ?? nextAlias.sourceKey;
    }

    nextVariables.aliases[nextKey] = nextAlias;
  }

  return GlobalStyleVariablesSchema.parse(nextVariables);
}

export function createEmptyVariableSet(): GlobalStyleVariables {
  return createDefaultGlobalStylesConfig().variables;
}
