/**
 * Single source of truth for custom-class pseudo states (presets + custom encoded).
 */

import { z } from "zod";

export const PseudoPresetIdSchema = z.enum([
  "hover",
  "focus",
  "active",
  "visited",
  "focus-visible",
  "focus-within",
  "disabled",
  "enabled",
  "checked",
  "indeterminate",
  "required",
  "optional",
  "valid",
  "invalid",
  "read-only",
  "first-child",
  "last-child",
  "only-child",
  "first-of-type",
  "last-of-type",
  "only-of-type",
  "odd",
  "even",
  "empty",
  "has-any-child",
  "has-child",
  "before",
  "after",
  "placeholder",
  "selection",
  "marker",
  "file",
]);
export type PseudoPresetId = z.infer<typeof PseudoPresetIdSchema>;

export const CustomPseudoStateSchema = z
  .string()
  .regex(/^custom:(has|not|is|where)\([^;{}]+\)$/);
export type CustomPseudoState = z.infer<typeof CustomPseudoStateSchema>;

export const PseudoStateSchema = z.union([
  PseudoPresetIdSchema,
  CustomPseudoStateSchema,
]);
export type PseudoState = z.infer<typeof PseudoStateSchema>;

export const InspectorPseudoStateSchema = z.union([
  z.literal("default"),
  PseudoStateSchema,
]);
export type InspectorPseudoState = z.infer<typeof InspectorPseudoStateSchema>;

export const PseudoPresetDefinitionSchema = z.object({
  id: PseudoPresetIdSchema,
  /** CSS selector suffix (e.g. ":hover", "::before", ":has(> *)") */
  suffix: z.string().min(1),
});
export type PseudoPresetDefinition = z.infer<
  typeof PseudoPresetDefinitionSchema
>;

const PSEUDO_PRESET_DEFINITIONS_RAW = [
  { id: "hover", suffix: ":hover" },
  { id: "focus", suffix: ":focus" },
  { id: "active", suffix: ":active" },
  { id: "visited", suffix: ":visited" },
  { id: "focus-visible", suffix: ":focus-visible" },
  { id: "focus-within", suffix: ":focus-within" },
  { id: "disabled", suffix: ":disabled" },
  { id: "enabled", suffix: ":enabled" },
  { id: "checked", suffix: ":checked" },
  { id: "indeterminate", suffix: ":indeterminate" },
  { id: "required", suffix: ":required" },
  { id: "optional", suffix: ":optional" },
  { id: "valid", suffix: ":valid" },
  { id: "invalid", suffix: ":invalid" },
  { id: "read-only", suffix: ":read-only" },
  { id: "first-child", suffix: ":first-child" },
  { id: "last-child", suffix: ":last-child" },
  { id: "only-child", suffix: ":only-child" },
  { id: "first-of-type", suffix: ":first-of-type" },
  { id: "last-of-type", suffix: ":last-of-type" },
  { id: "only-of-type", suffix: ":only-of-type" },
  { id: "odd", suffix: ":nth-child(odd)" },
  { id: "even", suffix: ":nth-child(even)" },
  { id: "empty", suffix: ":empty" },
  { id: "has-any-child", suffix: ":has(> *)" },
  { id: "has-child", suffix: ":has(*)" },
  { id: "before", suffix: "::before" },
  { id: "after", suffix: "::after" },
  { id: "placeholder", suffix: "::placeholder" },
  { id: "selection", suffix: "::selection" },
  { id: "marker", suffix: "::marker" },
  { id: "file", suffix: "::file-selector-button" },
] as const satisfies readonly PseudoPresetDefinition[];

export const PSEUDO_PRESET_DEFINITIONS = z
  .array(PseudoPresetDefinitionSchema)
  .parse(PSEUDO_PRESET_DEFINITIONS_RAW);

const PSEUDO_PRESET_SUFFIX_BY_ID = Object.fromEntries(
  PSEUDO_PRESET_DEFINITIONS.map((definition) => [
    definition.id,
    definition.suffix,
  ]),
) as Record<PseudoPresetId, string>;

export const CustomPseudoInputSchema = z.string().trim().min(3).max(120);

const CUSTOM_PSEUDO_FN_PATTERN = /^(has|not|is|where)\([^;{}]+\)$/;

export function getPseudoSelectorSuffix(state: PseudoState): string {
  const presetParsed = PseudoPresetIdSchema.safeParse(state);
  if (presetParsed.success) {
    return PSEUDO_PRESET_SUFFIX_BY_ID[presetParsed.data];
  }

  const customParsed = CustomPseudoStateSchema.safeParse(state);
  if (customParsed.success) {
    return `:${customParsed.data.slice("custom:".length)}`;
  }

  throw new Error(`Invalid pseudo state: ${String(state)}`);
}

export function formatPseudoStateLabel(state: PseudoState): string {
  return getPseudoSelectorSuffix(state);
}

export function parseCustomPseudoInput(
  raw: string,
): ReturnType<typeof CustomPseudoInputSchema.safeParse> {
  const trimmed = CustomPseudoInputSchema.safeParse(raw);
  if (!trimmed.success) {
    return trimmed;
  }

  let normalized = trimmed.data;
  while (normalized.startsWith(":")) {
    normalized = normalized.slice(1);
  }

  if (!CUSTOM_PSEUDO_FN_PATTERN.test(normalized)) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: "custom" as const,
          path: [],
          message:
            "Use has(), not(), is(), or where() with a selector argument (e.g. has(.icon))",
        },
      ]) as z.ZodError<string>,
    };
  }

  return PseudoStateSchema.safeParse(`custom:${normalized}`);
}

export function filterPseudoPresets(query: string): PseudoPresetDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...PSEUDO_PRESET_DEFINITIONS];
  }

  return PSEUDO_PRESET_DEFINITIONS.filter((definition) => {
    const idMatch = definition.id.toLowerCase().includes(normalized);
    const suffixMatch = definition.suffix.toLowerCase().includes(normalized);
    return idMatch || suffixMatch;
  });
}

export function getPseudoPresetById(
  id: PseudoPresetId,
): PseudoPresetDefinition | undefined {
  return PSEUDO_PRESET_DEFINITIONS.find((definition) => definition.id === id);
}
