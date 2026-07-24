/**
 * Responsive Schema
 *
 * Base schema for responsive (breakpoint-aware) values.
 */

import { z } from "zod";

/**
 * Schema for a responsive string value
 * Record<breakpoint, value>
 */
export const ResponsiveStringSchema = z.record(
  z.string(),
  z.string().optional()
);

export function createResponsiveSchema<T extends z.ZodType>(valueSchema: T) {
  return z.record(z.string(), valueSchema.optional());
}

export const ResponsiveNumberSchema = z.record(
  z.string(),
  z.number().optional()
);

export const ResponsiveBooleanSchema = z.record(
  z.string(),
  z.boolean().optional()
);

export function createDefaultResponsive<T>(value: T): Record<string, T> {
  return { default: value };
}

/**
 * Get value for a specific breakpoint, with fallback to 'default'
 */
export function getResponsiveValue<T>(
  responsive: Record<string, T | undefined> | undefined,
  breakpoint: string
): T | undefined {
  if (!responsive) return undefined;
  return responsive[breakpoint] ?? responsive["default"];
}

/**
 * Set value for a specific breakpoint
 */
export function setResponsiveValue<T>(
  responsive: Record<string, T | undefined> | undefined,
  breakpoint: string,
  value: T
): Record<string, T | undefined> {
  return {
    ...responsive,
    [breakpoint]: value,
  };
}
