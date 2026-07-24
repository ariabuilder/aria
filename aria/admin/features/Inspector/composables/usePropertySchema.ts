/**
 * Access to the schema registry with composable interface. Used
 * by property inputs to validate values before mutations.
 */

import { computed } from "vue";
import { getSchemaRegistry } from "../schemas/registry";
import type { PropertySchemaKey, ValidationResult } from "../types/schema";

/**
 * usePropertySchema - Schema validation composable
 *
 * @example
 * ```typescript
 * const { validate, getDefault, hasSchema } = usePropertySchema();
 *
 * // Validate a spacing value
 * const result = validate('spacing', userInput);
 * if (!result.success) {
 *   console.error('Invalid spacing:', result.errors);
 * }
 *
 * // Get default value for a property
 * const defaultSpacing = getDefault('spacing');
 * ```
 */
export function usePropertySchema() {
  const registry = getSchemaRegistry();

  /**
   * Validate a value against a schema
   */
  function validate<T>(
    schemaKey: PropertySchemaKey,
    value: T,
  ): ValidationResult<T> {
    return registry.validate(schemaKey, value);
  }

  /**
   * Check if a value is valid for a schema
   */
  function isValid<T>(schemaKey: PropertySchemaKey, value: T): boolean {
    return registry.validate(schemaKey, value).success;
  }

  /**
   * Get validation errors for a value
   */
  function getErrors<T>(schemaKey: PropertySchemaKey, value: T): string[] {
    const result = registry.validate(schemaKey, value);
    if (result.success) return [];
    return result.errors?.map((e) => e.message) ?? [];
  }

  /**
   * Get the schema entry for a property type
   */
  function getSchema(schemaKey: PropertySchemaKey) {
    return registry.get(schemaKey);
  }

  /**
   * Get the default value for a property type
   */
  function getDefault<K extends PropertySchemaKey>(schemaKey: K) {
    return registry.getDefault(schemaKey);
  }

  /**
   * Check if a schema exists
   */
  function hasSchema(key: string): boolean {
    return registry.has(key);
  }

  /**
   * Get all available schema keys
   */
  function getSchemaKeys(): PropertySchemaKey[] {
    return registry.keys();
  }

  /**
   * Parse and coerce a value to match the schema
   */
  function parse<K extends PropertySchemaKey>(
    schemaKey: K,
    value: unknown,
  ): ReturnType<typeof registry.getDefault<K>> | null {
    const entry = registry.get(schemaKey);
    if (!entry) return null;

    try {
      return entry.parse(value);
    } catch {
      return null;
    }
  }

  /**
   * Safe parse - returns result object instead of throwing
   */
  function safeParse<K extends PropertySchemaKey>(
    schemaKey: K,
    value: unknown,
  ) {
    const entry = registry.get(schemaKey);
    if (!entry) return { success: false as const, error: "Schema not found" };
    return entry.safeParse(value);
  }

  /**
   * Merge a partial value with defaults
   */
  function mergeWithDefaults<K extends PropertySchemaKey>(
    schemaKey: K,
    partialValue: Record<string, unknown>,
  ) {
    const defaults = registry.getDefault(schemaKey);
    if (!defaults || typeof defaults !== "object") return partialValue;

    return {
      ...defaults,
      ...partialValue,
    };
  }

  /**
   * All available schema keys
   */
  const availableSchemas = computed(() => registry.keys());

  return {
    registry,

    validate,
    isValid,
    getErrors,

    getSchema,
    getDefault,
    hasSchema,
    getSchemaKeys,

    parse,
    safeParse,

    mergeWithDefaults,

    availableSchemas,
  };
}

export type { PropertySchemaKey, ValidationResult };
