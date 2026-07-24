/**
 * Border Schema
 *
 * Zod validation for border-related values.
 */

import { z } from "zod";
import {
  ResponsiveStringSchema,
  createDefaultResponsive,
} from "./responsive.schema";

export const BorderSideSchema = z.enum([
  "all",
  "top",
  "right",
  "bottom",
  "left",
]);

/**
 * Border style options
 */
export const BorderStyleSchema = z.enum([
  "none",
  "hidden",
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
]);

export const BorderValueSchema = z.object({
  borderWidth: ResponsiveStringSchema,
  borderStyle: ResponsiveStringSchema,
  borderColor: ResponsiveStringSchema,
  borderTopWidth: ResponsiveStringSchema.optional(),
  borderRightWidth: ResponsiveStringSchema.optional(),
  borderBottomWidth: ResponsiveStringSchema.optional(),
  borderLeftWidth: ResponsiveStringSchema.optional(),
  borderTopStyle: ResponsiveStringSchema.optional(),
  borderRightStyle: ResponsiveStringSchema.optional(),
  borderBottomStyle: ResponsiveStringSchema.optional(),
  borderLeftStyle: ResponsiveStringSchema.optional(),
  borderTopColor: ResponsiveStringSchema.optional(),
  borderRightColor: ResponsiveStringSchema.optional(),
  borderBottomColor: ResponsiveStringSchema.optional(),
  borderLeftColor: ResponsiveStringSchema.optional(),
});

export type BorderValue = z.infer<typeof BorderValueSchema>;
export type BorderSide = z.infer<typeof BorderSideSchema>;
export type BorderStyle = z.infer<typeof BorderStyleSchema>;

export const DEFAULT_BORDER: BorderValue = {
  borderWidth: createDefaultResponsive("0"),
  borderStyle: createDefaultResponsive("solid"),
  borderColor: createDefaultResponsive("transparent"),
};

export const BORDER_WIDTH_PRESETS = [
  { label: "None", value: "0" },
  { label: "1px", value: "1px" },
  { label: "2px", value: "2px" },
  { label: "4px", value: "4px" },
  { label: "8px", value: "8px" },
];

export const BORDER_STYLE_LABELS: Record<string, string> = {
  none: "None",
  hidden: "Hidden",
  solid: "Solid",
  dashed: "Dashed",
  dotted: "Dotted",
  double: "Double",
  groove: "Groove",
  ridge: "Ridge",
  inset: "Inset",
  outset: "Outset",
};
