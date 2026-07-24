/**
 * Spacing Schema
 *
 * Zod validation for margin and padding values.
 */

import { z } from "zod";
import {
  ResponsiveStringSchema,
  createDefaultResponsive,
} from "./responsive.schema";

export const SpacingSideSchema = z.enum(["top", "right", "bottom", "left"]);

export const SpacingTypeSchema = z.enum(["margin", "padding"]);

export const SpacingValueSchema = z.object({
  marginTop: ResponsiveStringSchema,
  marginRight: ResponsiveStringSchema,
  marginBottom: ResponsiveStringSchema,
  marginLeft: ResponsiveStringSchema,
  paddingTop: ResponsiveStringSchema,
  paddingRight: ResponsiveStringSchema,
  paddingBottom: ResponsiveStringSchema,
  paddingLeft: ResponsiveStringSchema,
});

export type SpacingValue = z.infer<typeof SpacingValueSchema>;
export type SpacingSide = z.infer<typeof SpacingSideSchema>;
export type SpacingType = z.infer<typeof SpacingTypeSchema>;

export const DEFAULT_SPACING: SpacingValue = {
  marginTop: createDefaultResponsive("0"),
  marginRight: createDefaultResponsive("0"),
  marginBottom: createDefaultResponsive("0"),
  marginLeft: createDefaultResponsive("0"),
  paddingTop: createDefaultResponsive("0"),
  paddingRight: createDefaultResponsive("0"),
  paddingBottom: createDefaultResponsive("0"),
  paddingLeft: createDefaultResponsive("0"),
};

export function createSpacingFromShorthand(
  type: SpacingType,
  value: string
): Partial<SpacingValue> {
  const prefix = type === "margin" ? "margin" : "padding";
  const responsive = createDefaultResponsive(value);

  return {
    [`${prefix}Top`]: responsive,
    [`${prefix}Right`]: responsive,
    [`${prefix}Bottom`]: responsive,
    [`${prefix}Left`]: responsive,
  } as Partial<SpacingValue>;
}

/**
 * Parse CSS spacing shorthand (e.g., "10px 20px")
 */
export function parseSpacingShorthand(shorthand: string): {
  top: string;
  right: string;
  bottom: string;
  left: string;
} {
  const parts = shorthand.trim().split(/\s+/);

  switch (parts.length) {
    case 1:
      return {
        top: parts[0],
        right: parts[0],
        bottom: parts[0],
        left: parts[0],
      };
    case 2:
      return {
        top: parts[0],
        right: parts[1],
        bottom: parts[0],
        left: parts[1],
      };
    case 3:
      return {
        top: parts[0],
        right: parts[1],
        bottom: parts[2],
        left: parts[1],
      };
    case 4:
      return {
        top: parts[0],
        right: parts[1],
        bottom: parts[2],
        left: parts[3],
      };
    default:
      return { top: "0", right: "0", bottom: "0", left: "0" };
  }
}
