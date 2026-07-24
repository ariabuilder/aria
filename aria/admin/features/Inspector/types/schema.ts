
import type { z } from "zod";

export interface ValidationError {
  path: (string | number)[];
  message: string;
  code: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

export interface SchemaEntry<T extends z.ZodType = z.ZodType> {
  schema: T;
  defaultValue: z.infer<T>;
  description?: string;
  /** Validate a value against this schema */
  validate: (value: unknown) => ValidationResult<z.infer<T>>;
  parse: (value: unknown) => z.infer<T>;
  safeParse: (value: unknown) => z.ZodSafeParseResult<z.infer<T>>;
}

export interface PropertySchemaMap {
  text: SchemaEntry;
  list: SchemaEntry;
  spacing: SchemaEntry;
  typography: SchemaEntry;
  border: SchemaEntry;
  background: SchemaEntry;
  size: SchemaEntry;
  position: SchemaEntry;
  transform: SchemaEntry;
  corner: SchemaEntry;
  shadow: SchemaEntry;
  filter: SchemaEntry;
  link: SchemaEntry;
  image: SchemaEntry;
  video: SchemaEntry;
  visibility: SchemaEntry;
  classes: SchemaEntry;
  motion: SchemaEntry;
}

/**
 * Property type keys
 */
export type PropertySchemaKey = keyof PropertySchemaMap;

export type SchemaValueType<K extends PropertySchemaKey> =
  PropertySchemaMap[K] extends SchemaEntry<infer T> ? z.infer<T> : never;

export interface ResponsiveSchemaOptions {
  optional?: boolean;
  defaultBreakpoint?: string;
  breakpoints?: string[];
}
