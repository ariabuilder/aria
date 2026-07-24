/**
 * Size Schema
 *
 * Zod validation for width/height sizing values.
 */

import { z } from "zod";
import {
  ResponsiveStringSchema,
  createDefaultResponsive,
} from "./responsive.schema";

/**
 * Figma-like sizing modes (persisted separately from exact CSS values)
 */
export const SizeModeSchema = z.enum(["hug", "fill", "exact"]);

/**
 * Size units
 */
export const SizeUnitSchema = z.enum([
  "px",
  "rem",
  "em",
  "%",
  "vw",
  "vh",
  "auto",
  "fit-content",
  "min-content",
  "max-content",
]);

export const SizeValueSchema = z.object({
  width: ResponsiveStringSchema,
  height: ResponsiveStringSchema,
  widthSizing: ResponsiveStringSchema,
  heightSizing: ResponsiveStringSchema,
  minWidth: ResponsiveStringSchema,
  minHeight: ResponsiveStringSchema,
  maxWidth: ResponsiveStringSchema,
  maxHeight: ResponsiveStringSchema,
});

export type SizeValue = z.infer<typeof SizeValueSchema>;
export type SizeMode = z.infer<typeof SizeModeSchema>;
export type SizeUnit = z.infer<typeof SizeUnitSchema>;

export const DEFAULT_SIZE: SizeValue = {
  width: createDefaultResponsive("auto"),
  height: createDefaultResponsive("auto"),
  widthSizing: createDefaultResponsive("hug"),
  heightSizing: createDefaultResponsive("hug"),
  minWidth: createDefaultResponsive("0"),
  minHeight: createDefaultResponsive("0"),
  maxWidth: createDefaultResponsive("none"),
  maxHeight: createDefaultResponsive("none"),
};

export const WIDTH_PRESETS = [
  { label: "Auto", value: "auto" },
  { label: "Full", value: "100%" },
  { label: "Screen", value: "100vw" },
  { label: "1/2", value: "50%" },
  { label: "1/3", value: "33.333%" },
  { label: "2/3", value: "66.666%" },
  { label: "1/4", value: "25%" },
  { label: "3/4", value: "75%" },
];

export const MAX_WIDTH_PRESETS = [
  { label: "None", value: "none" },
  { label: "XS", value: "20rem" },
  { label: "SM", value: "24rem" },
  { label: "MD", value: "28rem" },
  { label: "LG", value: "32rem" },
  { label: "XL", value: "36rem" },
  { label: "2XL", value: "42rem" },
  { label: "3XL", value: "48rem" },
  { label: "4XL", value: "56rem" },
  { label: "5XL", value: "64rem" },
  { label: "6XL", value: "72rem" },
  { label: "7XL", value: "80rem" },
  { label: "Full", value: "100%" },
];

export function parseSizeValue(
  value: string
): { num: number; unit: string } | null {
  const match = value.match(/^(-?\d*\.?\d+)(px|rem|em|%|vw|vh)?$/);
  if (!match) return null;

  return {
    num: parseFloat(match[1]),
    unit: match[2] || "px",
  };
}

/**
 * Format number and unit to size string
 */
export function formatSizeValue(num: number, unit: string): string {
  if (unit === "auto" || unit === "none") return unit;
  return `${num}${unit}`;
}
