/**
 * List Schema
 *
 * Zod validation for list semantics and marker styling.
 */

import { z } from "zod";

import {
  createDefaultResponsive,
  createResponsiveSchema,
} from "./responsive.schema";

export const ORDERED_LIST_STYLE_TYPES = [
  "decimal",
  "lower-alpha",
  "upper-alpha",
  "lower-roman",
  "upper-roman",
] as const;

export const UNORDERED_LIST_STYLE_TYPES = [
  "disc",
  "circle",
  "square",
  "none",
] as const;

export const LIST_STYLE_TYPES = [
  ...ORDERED_LIST_STYLE_TYPES,
  ...UNORDERED_LIST_STYLE_TYPES,
] as const;

export const LIST_STYLE_POSITIONS = ["outside", "inside"] as const;

export const ListStyleTypeSchema = z.enum(LIST_STYLE_TYPES);
export const ListStylePositionSchema = z.enum(LIST_STYLE_POSITIONS);

export const ListValueSchema = z.object({
  ordered: z.boolean(),
  listStyleType: createResponsiveSchema(ListStyleTypeSchema),
  listStylePosition: createResponsiveSchema(ListStylePositionSchema),
});

export type ListStyleType = z.infer<typeof ListStyleTypeSchema>;
export type ListStylePosition = z.infer<typeof ListStylePositionSchema>;
export type ListValue = z.infer<typeof ListValueSchema>;

export const DEFAULT_LIST: ListValue = {
  ordered: false,
  listStyleType: createDefaultResponsive("none"),
  listStylePosition: createDefaultResponsive("outside"),
};
