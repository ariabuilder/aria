import { z } from "zod";

import type {
  GlobalStyleVariableCategory,
  GlobalStyleVariables,
} from "../../lib/styles/universalDesignSystem";

export const VariableReferenceOptionSchema = z.object({
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
  meta: z.string().trim().min(1),
  group: z.string().trim().min(1),
});

export type VariableReferenceOption = z.infer<
  typeof VariableReferenceOptionSchema
>;

export const VARIABLE_REFERENCE_PATTERN =
  /^var\(--([a-zA-Z0-9-_]+)(?:\s*,\s*[^)]+)?\)$/;

function startCase(value: string): string {
  return value
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function extractVariableReferenceKey(rawValue: string): string | null {
  const matched = rawValue.trim().match(VARIABLE_REFERENCE_PATTERN);
  return matched?.[1] ?? null;
}

export function createVariableReferenceValue(variableKey: string): string {
  return `var(--${variableKey})`;
}

export function resolveVariableDefinitionCategory(
  key: string,
  variables: GlobalStyleVariables,
  visited: Set<string> = new Set(),
): GlobalStyleVariableCategory | null {
  const normalizedKey = key.trim();
  if (!normalizedKey || visited.has(normalizedKey)) {
    return null;
  }

  visited.add(normalizedKey);

  const customDefinition = variables.custom[normalizedKey];
  if (customDefinition) {
    return customDefinition.category;
  }

  const alias = variables.aliases[normalizedKey];
  if (!alias || alias.sourceType !== "custom") {
    return null;
  }

  return resolveVariableDefinitionCategory(alias.sourceKey, variables, visited);
}

export function isOpacityCompatibleVariableKey(
  key: string,
  variables: GlobalStyleVariables,
): boolean {
  return resolveVariableDefinitionCategory(key, variables) === "effects";
}

export function buildOpacityVariableReferenceOptions(
  variables: GlobalStyleVariables,
): VariableReferenceOption[] {
  return buildVariableReferenceOptions(variables).filter((option) =>
    isOpacityCompatibleVariableKey(option.value, variables),
  );
}

export function buildVariableReferenceOptions(
  variables: GlobalStyleVariables,
): VariableReferenceOption[] {
  const customOptions = Object.entries(variables.custom).map(
    ([key, variable]) =>
      VariableReferenceOptionSchema.parse({
        value: key,
        label: variable.label.trim() || `--${key}`,
        meta: `${startCase(variable.category)} · --${key}`,
        group: "Custom Variables",
      }),
  );

  const aliasOptions = Object.entries(variables.aliases).map(([key, alias]) =>
    VariableReferenceOptionSchema.parse({
      value: key,
      label: alias.label.trim() || `--${key}`,
      meta: `Alias · --${key}`,
      group: "Aliases",
    }),
  );

  return [...customOptions, ...aliasOptions].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}
