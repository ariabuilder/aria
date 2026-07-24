import type { PopoverContentProps } from "reka-ui";
import type { ColorInputFormat } from "@/features/Design/lib/colorFormat";

export type ColorPickerLayout = "compact" | "unified";
export type ColorPickerValueMode = "literal" | "reference" | "reference-unresolved";
export type ColorPickerPersistMode = "live" | "commit";

export type ColorFieldVariant = "inspector" | "toolbar";

export interface ColorPickerProps {
  modelValue: string;
  resolvedModelValue?: string | null;
  contrastAgainst?: string | null;
  resolvedContrastAgainst?: string | null;
  showAlpha?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  showDesignColors?: boolean;
  showVariables?: boolean;
  layout?: ColorPickerLayout;
  persistMode?: ColorPickerPersistMode;
  contentClass?: string;
  contentSide?: PopoverContentProps["side"];
  contentAlign?: PopoverContentProps["align"];
  contentSideOffset?: PopoverContentProps["sideOffset"];
  contentAlignOffset?: PopoverContentProps["alignOffset"];
}

export interface ColorPickerEmits {
  "update:modelValue": [value: string];
  preview: [value: string];
  commit: [value: string];
}

/** Scoped props passed to the default trigger slot. */
export interface ColorPickerTriggerSlotProps {
  previewColor: string;
  valueMode: ColorPickerValueMode;
}

export type { ColorInputFormat };
