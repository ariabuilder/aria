/**
 * Visibility Schema
 *
 * Zod validation for display/visibility values.
 */

import { z } from "zod";
import {
  ResponsiveStringSchema,
  createDefaultResponsive,
} from "./responsive.schema";

/**
 * CSS visibility property
 */
export const VisibilityModeSchema = z.enum(["visible", "hidden", "collapse"]);

/**
 * CSS display property common values
 */
export const DisplayModeSchema = z.enum([
  "block",
  "inline",
  "inline-block",
  "flex",
  "inline-flex",
  "grid",
  "grid-lanes",
  "inline-grid",
  "none",
  "contents",
  "initial",
  "inherit",
]);

export const FlexDirectionSchema = z.enum(["row", "column"]);

export const FlexWrapSchema = z.enum(["nowrap", "wrap", "wrap-reverse"]);

export const FlexAlignItemsSchema = z.enum([
  "flex-start",
  "center",
  "flex-end",
  "stretch",
]);

export const FlexJustifyContentSchema = z.enum([
  "flex-start",
  "center",
  "flex-end",
  "space-between",
]);

export const FlexAlignContentSchema = z.enum([
  "flex-start",
  "center",
  "flex-end",
  "space-between",
  "stretch",
]);

export const GridAlignItemsSchema = z.enum([
  "start",
  "center",
  "end",
  "stretch",
]);

export const GridJustifyItemsSchema = z.enum([
  "start",
  "center",
  "end",
  "stretch",
]);

export const GridAlignContentSchema = z.enum([
  "start",
  "center",
  "end",
  "space-between",
  "stretch",
]);

export const GridJustifyContentSchema = z.enum([
  "start",
  "center",
  "end",
  "space-between",
  "stretch",
]);

/**
 * Visibility per breakpoint
 */
export const VisibilityBreakpointSchema = z.object({
  breakpoint: z.string(),
  visible: z.boolean(),
});

export const VisibilityValueSchema = z.object({
  display: ResponsiveStringSchema,
  visibility: ResponsiveStringSchema,
  opacity: ResponsiveStringSchema,
  breakpoints: z.array(VisibilityBreakpointSchema).optional(),
});

export type VisibilityValue = z.infer<typeof VisibilityValueSchema>;
export type VisibilityMode = z.infer<typeof VisibilityModeSchema>;
export type DisplayMode = z.infer<typeof DisplayModeSchema>;
export type FlexDirection = z.infer<typeof FlexDirectionSchema>;
export type FlexWrap = z.infer<typeof FlexWrapSchema>;
export type FlexAlignItems = z.infer<typeof FlexAlignItemsSchema>;
export type FlexJustifyContent = z.infer<typeof FlexJustifyContentSchema>;
export type FlexAlignContent = z.infer<typeof FlexAlignContentSchema>;
export type GridAlignItems = z.infer<typeof GridAlignItemsSchema>;
export type GridJustifyItems = z.infer<typeof GridJustifyItemsSchema>;
export type GridAlignContent = z.infer<typeof GridAlignContentSchema>;
export type GridJustifyContent = z.infer<typeof GridJustifyContentSchema>;
export type VisibilityBreakpoint = z.infer<typeof VisibilityBreakpointSchema>;

export const DEFAULT_VISIBILITY: VisibilityValue = {
  display: createDefaultResponsive("block"),
  visibility: createDefaultResponsive("visible"),
  opacity: createDefaultResponsive("1"),
};

export const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
  block: "Block",
  inline: "Inline",
  "inline-block": "Inline Block",
  flex: "Flex",
  "inline-flex": "Inline Flex",
  grid: "Grid",
  "grid-lanes": "Grid Lanes",
  "inline-grid": "Inline Grid",
  none: "None (Hidden)",
  contents: "Contents",
  initial: "Initial",
  inherit: "Inherit",
};

export const FLEX_DISPLAY_MODES = ["flex", "inline-flex"] as const;
export const GRID_DISPLAY_MODES = [
  "grid",
  "grid-lanes",
  "inline-grid",
] as const;

export const OPACITY_PRESETS = [
  { label: "0%", value: "0" },
  { label: "25%", value: "0.25" },
  { label: "50%", value: "0.5" },
  { label: "75%", value: "0.75" },
  { label: "100%", value: "1" },
];

export function isElementVisible(
  value: VisibilityValue,
  breakpoint = "default",
): boolean {
  const display = value.display?.[breakpoint] ?? value.display?.["default"];
  const visibility =
    value.visibility?.[breakpoint] ?? value.visibility?.["default"];
  const opacity = value.opacity?.[breakpoint] ?? value.opacity?.["default"];

  if (display === "none") return false;
  if (visibility === "hidden" || visibility === "collapse") return false;
  if (opacity === "0") return false;

  return true;
}

export function getVisibilityMap(
  value: VisibilityValue,
  breakpoints: string[],
): Record<string, boolean> {
  const map: Record<string, boolean> = {};

  for (const bp of breakpoints) {
    map[bp] = isElementVisible(value, bp);
  }

  return map;
}

/**
 * Generate Tailwind classes for responsive hiding
 */
export function generateHiddenClasses(
  visibilityMap: Record<string, boolean>,
  breakpointOrder: string[],
): string[] {
  const classes: string[] = [];

  for (let i = 0; i < breakpointOrder.length; i++) {
    const bp = breakpointOrder[i];
    const isVisible = visibilityMap[bp];
    const prevBp = i > 0 ? breakpointOrder[i - 1] : null;
    const wasVisible = prevBp ? visibilityMap[prevBp] : true;

    if (bp === "default" || bp === "base") {
      if (!isVisible) classes.push("hidden");
    } else {
      if (!isVisible && wasVisible) classes.push(`${bp}:hidden`);
      if (isVisible && !wasVisible) classes.push(`${bp}:block`);
    }
  }

  return classes;
}
