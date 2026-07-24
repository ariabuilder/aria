import { z } from "zod";

import {
  GLOBAL_STYLE_BUTTON_VARIANTS,
  type GlobalStyleButtonVariant,
} from "../styles/universalDesignSystem";

export const BUTTON_VARIANT_ATTRIBUTE = "data-button-variant";

export const SELECTABLE_BUTTON_VARIANTS = [
  GLOBAL_STYLE_BUTTON_VARIANTS[0],
  GLOBAL_STYLE_BUTTON_VARIANTS[1],
  GLOBAL_STYLE_BUTTON_VARIANTS[2],
  GLOBAL_STYLE_BUTTON_VARIANTS[3],
] as const satisfies readonly Exclude<GlobalStyleButtonVariant, "disabled">[];

export type SelectableButtonVariant =
  (typeof SELECTABLE_BUTTON_VARIANTS)[number];

export const SelectableButtonVariantSchema = z.enum(SELECTABLE_BUTTON_VARIANTS);

const BUTTON_VARIANT_LABELS: Record<SelectableButtonVariant, string> = {
  primary: "Primary",
  secondary: "Secondary",
  muted: "Muted",
  destructive: "Destructive",
};

export const BUTTON_VARIANT_OPTIONS: ReadonlyArray<{
  value: SelectableButtonVariant;
  label: string;
}> = SELECTABLE_BUTTON_VARIANTS.map((variant) => ({
  value: variant,
  label: BUTTON_VARIANT_LABELS[variant],
}));

export function getButtonVariant(
  value: unknown,
): SelectableButtonVariant | undefined {
  const parsed = SelectableButtonVariantSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function getButtonVariantOrDefault(
  value: unknown,
): SelectableButtonVariant {
  return getButtonVariant(value) ?? "primary";
}
