/**
 * Typography Schema
 *
 * Zod validation for typography-related values.
 */

import { z } from "zod";
import {
  ResponsiveStringSchema,
  createDefaultResponsive,
} from "./responsive.schema";

/**
 * Font weight options
 */
export const FontWeightSchema = z.enum([
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
]);

/**
 * Text alignment options
 */
export const TextAlignSchema = z.enum(["left", "center", "right", "justify"]);

/**
 * Text transform options
 */
export const TextTransformSchema = z.enum([
  "none",
  "uppercase",
  "lowercase",
  "capitalize",
]);

/**
 * Text decoration options
 */
export const TextDecorationSchema = z.enum([
  "none",
  "underline",
  "overline",
  "line-through",
]);

/**
 * Text wrap options
 */
export const TextWrapSchema = z.enum(["wrap", "nowrap", "balance", "pretty"]);

export const TypographyValueSchema = z.object({
  fontFamily: ResponsiveStringSchema,
  fontSize: ResponsiveStringSchema,
  fontWeight: ResponsiveStringSchema,
  lineHeight: ResponsiveStringSchema,
  letterSpacing: ResponsiveStringSchema,
  textAlign: ResponsiveStringSchema,
  textTransform: ResponsiveStringSchema,
  textDecoration: ResponsiveStringSchema,
  textWrap: ResponsiveStringSchema,
  color: ResponsiveStringSchema,
});

export type TypographyValue = z.infer<typeof TypographyValueSchema>;
export type FontWeight = z.infer<typeof FontWeightSchema>;
export type TextAlign = z.infer<typeof TextAlignSchema>;
export type TextTransform = z.infer<typeof TextTransformSchema>;
export type TextWrap = z.infer<typeof TextWrapSchema>;

export const DEFAULT_TYPOGRAPHY: TypographyValue = {
  fontFamily: createDefaultResponsive("inherit"),
  fontSize: createDefaultResponsive("inherit"),
  fontWeight: createDefaultResponsive("400"),
  lineHeight: createDefaultResponsive("inherit"),
  letterSpacing: createDefaultResponsive("normal"),
  textAlign: createDefaultResponsive("left"),
  textTransform: createDefaultResponsive("none"),
  textDecoration: createDefaultResponsive("none"),
  textWrap: createDefaultResponsive("wrap"),
  color: createDefaultResponsive("inherit"),
};

export const FONT_WEIGHT_LABELS: Record<string, string> = {
  "100": "Thin",
  "200": "Extra Light",
  "300": "Light",
  "400": "Regular",
  "500": "Medium",
  "600": "Semi Bold",
  "700": "Bold",
  "800": "Extra Bold",
  "900": "Black",
};

export const FONT_SIZE_PRESETS = [
  { label: "XS", value: "0.75rem" },
  { label: "SM", value: "0.875rem" },
  { label: "Base", value: "1rem" },
  { label: "LG", value: "1.125rem" },
  { label: "XL", value: "1.25rem" },
  { label: "2XL", value: "1.5rem" },
  { label: "3XL", value: "1.875rem" },
  { label: "4XL", value: "2.25rem" },
  { label: "5XL", value: "3rem" },
  { label: "6XL", value: "3.75rem" },
];
