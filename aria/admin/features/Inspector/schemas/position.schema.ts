/**
 * Position Schema
 *
 * Zod validation for CSS positioning values.
 */

import { z } from "zod";

import {
  ResponsiveStringSchema,
  createDefaultResponsive,
} from "./responsive.schema";

export const PositionModeSchema = z.enum([
  "static",
  "relative",
  "absolute",
  "fixed",
  "sticky",
]);

export const PositionValueSchema = z.object({
  position: ResponsiveStringSchema,
  top: ResponsiveStringSchema,
  right: ResponsiveStringSchema,
  bottom: ResponsiveStringSchema,
  left: ResponsiveStringSchema,
  zIndex: ResponsiveStringSchema,
});

export type PositionMode = z.infer<typeof PositionModeSchema>;
export type PositionValue = z.infer<typeof PositionValueSchema>;

export const DEFAULT_POSITION: PositionValue = {
  position: createDefaultResponsive("static"),
  top: createDefaultResponsive("auto"),
  right: createDefaultResponsive("auto"),
  bottom: createDefaultResponsive("auto"),
  left: createDefaultResponsive("auto"),
  zIndex: createDefaultResponsive("auto"),
};
