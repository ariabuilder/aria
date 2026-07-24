/**
 * Shadow Schema
 *
 * Zod validation for box-shadow values.
 */

import { z } from "zod";
import {
  ResponsiveStringSchema,
  createDefaultResponsive,
} from "./responsive.schema";

/**
 * Shadow types
 */
export const ShadowTypeSchema = z.enum(["box", "drop", "text"]);

/**
 * Single shadow definition
 */
export const ShadowDefinitionSchema = z.object({
  type: ShadowTypeSchema.default("box"),
  offsetX: z.string().default("0"),
  offsetY: z.string().default("0"),
  blur: z.string().default("0"),
  spread: z.string().optional(),
  color: z.string().default("rgba(0, 0, 0, 0.1)"),
  inset: z.boolean().optional(),
});

export const ShadowValueSchema = z.object({
  boxShadow: ResponsiveStringSchema,
  shadows: z.array(ShadowDefinitionSchema).optional(),
});

export type ShadowValue = z.infer<typeof ShadowValueSchema>;
export type ShadowDefinition = z.infer<typeof ShadowDefinitionSchema>;
export type ShadowType = z.infer<typeof ShadowTypeSchema>;

export const DEFAULT_SHADOW: ShadowValue = {
  boxShadow: createDefaultResponsive("none"),
};

export const SHADOW_PRESETS = [
  { label: "None", value: "none" },
  { label: "SM", value: "0 1px 2px 0 rgb(0 0 0 / 0.05)" },
  {
    label: "Default",
    value: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  },
  {
    label: "MD",
    value: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  },
  {
    label: "LG",
    value: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  },
  {
    label: "XL",
    value:
      "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  },
  { label: "2XL", value: "0 25px 50px -12px rgb(0 0 0 / 0.25)" },
  { label: "Inner", value: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)" },
];

export function shadowToCSS(shadow: ShadowDefinition): string {
  const parts = [
    shadow.inset ? "inset" : "",
    shadow.offsetX,
    shadow.offsetY,
    shadow.blur,
    shadow.spread || "",
    shadow.color,
  ].filter(Boolean);

  return parts.join(" ");
}

export function shadowsToCSS(shadows: ShadowDefinition[]): string {
  if (shadows.length === 0) return "none";
  return shadows.map(shadowToCSS).join(", ");
}

export function cssToShadow(css: string): ShadowDefinition | null {
  if (css === "none") return null;

  const inset = css.includes("inset");
  const cleaned = css.replace("inset", "").trim();

  // Match: offsetX offsetY blur spread? color
  const match = cleaned.match(
    /^(-?\d+(?:\.\d+)?(?:px|rem|em)?)\s+(-?\d+(?:\.\d+)?(?:px|rem|em)?)\s+(\d+(?:\.\d+)?(?:px|rem|em)?)\s*(\d+(?:\.\d+)?(?:px|rem|em)?)?\s*(.+)?$/
  );

  if (!match) return null;

  return {
    type: "box",
    offsetX: match[1] || "0",
    offsetY: match[2] || "0",
    blur: match[3] || "0",
    spread: match[4] || undefined,
    color: match[5] || "rgba(0, 0, 0, 0.1)",
    inset,
  };
}
