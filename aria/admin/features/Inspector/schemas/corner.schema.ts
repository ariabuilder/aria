/**
 * Corner Schema
 *
 * Zod validation for border-radius values.
 */

import { z } from "zod";
import {
  ResponsiveStringSchema,
  createDefaultResponsive,
} from "./responsive.schema";

/**
 * Corner positions
 */
export const CornerSideSchema = z.enum([
  "all",
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
]);

export const CornerShapeKeywordSchema = z.enum([
  "round",
  "squircle",
  "bevel",
  "scoop",
  "notch",
  "square",
]);

export const CornerValueSchema = z.object({
  borderRadius: ResponsiveStringSchema,
  cornerShape: ResponsiveStringSchema.optional(),
  borderTopLeftRadius: ResponsiveStringSchema.optional(),
  borderTopRightRadius: ResponsiveStringSchema.optional(),
  borderBottomRightRadius: ResponsiveStringSchema.optional(),
  borderBottomLeftRadius: ResponsiveStringSchema.optional(),
});

export type CornerValue = z.infer<typeof CornerValueSchema>;
export type CornerSide = z.infer<typeof CornerSideSchema>;
export type CornerShapeKeyword = z.infer<typeof CornerShapeKeywordSchema>;

export const DEFAULT_CORNER_SHAPE: CornerShapeKeyword = "round";

export const DEFAULT_CORNER: CornerValue = {
  borderRadius: createDefaultResponsive("0"),
  cornerShape: createDefaultResponsive(DEFAULT_CORNER_SHAPE),
};

/**
 * Common border radius presets
 */
export const CORNER_PRESETS = [
  { label: "None", value: "0" },
  { label: "SM", value: "0.125rem" },
  { label: "Default", value: "0.25rem" },
  { label: "MD", value: "0.375rem" },
  { label: "LG", value: "0.5rem" },
  { label: "XL", value: "0.75rem" },
  { label: "2XL", value: "1rem" },
  { label: "3XL", value: "1.5rem" },
  { label: "Full", value: "9999px" },
];

export const CORNER_SHAPE_OPTIONS = [
  { label: "Round", value: "round" },
  { label: "Squircle", value: "squircle" },
  { label: "Bevel", value: "bevel" },
  { label: "Scoop", value: "scoop" },
  { label: "Notch", value: "notch" },
  { label: "Square", value: "square" },
  { label: "Soft Superellipse", value: "superellipse(1.5)" },
  { label: "Pinched Superellipse", value: "superellipse(0.5)" },
  { label: "Soft Scoop", value: "superellipse(-0.5)" },
  { label: "Deep Scoop", value: "superellipse(-1.5)" },
];

/**
 * Check if all corners have the same value
 */
export function hasUniformCorners(value: CornerValue): boolean {
  const base = value.borderRadius?.default;
  if (!base) return true;

  const corners = [
    value.borderTopLeftRadius?.default,
    value.borderTopRightRadius?.default,
    value.borderBottomRightRadius?.default,
    value.borderBottomLeftRadius?.default,
  ];

  return corners.every((c) => c === undefined || c === base);
}

/**
 * Parse CSS border-radius shorthand
 */
export function parseCornerShorthand(shorthand: string): {
  topLeft: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
} {
  const parts = shorthand.trim().split(/\s+/);

  switch (parts.length) {
    case 1:
      return {
        topLeft: parts[0],
        topRight: parts[0],
        bottomRight: parts[0],
        bottomLeft: parts[0],
      };
    case 2:
      return {
        topLeft: parts[0],
        topRight: parts[1],
        bottomRight: parts[0],
        bottomLeft: parts[1],
      };
    case 3:
      return {
        topLeft: parts[0],
        topRight: parts[1],
        bottomRight: parts[2],
        bottomLeft: parts[1],
      };
    case 4:
      return {
        topLeft: parts[0],
        topRight: parts[1],
        bottomRight: parts[2],
        bottomLeft: parts[3],
      };
    default:
      return { topLeft: "0", topRight: "0", bottomRight: "0", bottomLeft: "0" };
  }
}

export function normalizeCornerShapeValue(
  value: string | null | undefined,
): string {
  if (typeof value !== "string") {
    return DEFAULT_CORNER_SHAPE;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || DEFAULT_CORNER_SHAPE;
}

export function parseCornerShapeShorthand(
  shorthand: string | null | undefined,
): {
  topLeft: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
} {
  const normalized = normalizeCornerShapeValue(shorthand);
  const parts = normalized.split(/\s+/);

  switch (parts.length) {
    case 1:
      return {
        topLeft: parts[0],
        topRight: parts[0],
        bottomRight: parts[0],
        bottomLeft: parts[0],
      };
    case 2:
      return {
        topLeft: parts[0],
        topRight: parts[1],
        bottomRight: parts[0],
        bottomLeft: parts[1],
      };
    case 3:
      return {
        topLeft: parts[0],
        topRight: parts[1],
        bottomRight: parts[2],
        bottomLeft: parts[1],
      };
    case 4:
      return {
        topLeft: parts[0],
        topRight: parts[1],
        bottomRight: parts[2],
        bottomLeft: parts[3],
      };
    default:
      return {
        topLeft: DEFAULT_CORNER_SHAPE,
        topRight: DEFAULT_CORNER_SHAPE,
        bottomRight: DEFAULT_CORNER_SHAPE,
        bottomLeft: DEFAULT_CORNER_SHAPE,
      };
  }
}
