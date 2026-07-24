/**
 * Values. Simplifies handling of breakpoint-based property values.
 */

import type {
  Responsive,
  BreakpointDefinition,
} from "../../../../lib/types/nodes";
import { DEFAULT_BREAKPOINTS } from "../../../../lib/types/nodes";
import {
  DESKTOP_BASE_BREAKPOINT,
  sortBreakpointDefinitionsDesktopFirst,
} from "../../../../lib/styles/responsiveBreakpoints";

/**
 * Get a value from a responsive property for a specific breakpoint
 * Returns the explicitly authored value for a breakpoint.
 *
 * @param responsive - Responsive value object
 * @param breakpoint - Breakpoint name to get value for
 * @param fallback - Default value if not found
 * @returns The value for the breakpoint or fallback
 *
 * @example
 * ```typescript
 * const padding = { base: '1rem', tablet: '2rem', desktop: '3rem' };
 * getResponsiveValue(padding, 'tablet'); // '2rem'
 * getResponsiveValue(padding, 'mobile'); // undefined
 * getResponsiveValue(padding, 'base', '0'); // '1rem'
 * ```
 */
export function getResponsiveValue<T>(
  responsive: Responsive<T> | T | undefined,
  breakpoint: string = "base",
  fallback?: T,
): T | undefined {
  // If not a responsive object, return as-is or fallback
  if (!responsive || typeof responsive !== "object") {
    return (responsive as T) ?? fallback;
  }

  const responsiveObj = responsive as Responsive<T>;

  // Try to get value for requested breakpoint
  if (responsiveObj[breakpoint] !== undefined) {
    return responsiveObj[breakpoint];
  }

  // Return fallback if nothing found
  return fallback;
}

/**
 * Set a value in a responsive property for a specific breakpoint
 *
 * @param responsive - Existing responsive object (or undefined)
 * @param breakpoint - Breakpoint name to set
 * @param value - Value to set (undefined to remove)
 * @returns Updated responsive object
 *
 * @example
 * ```typescript
 * let padding = { base: '1rem' };
 * padding = setResponsiveValue(padding, 'tablet', '2rem');
 * // { base: '1rem', tablet: '2rem' }
 * ```
 */
export function setResponsiveValue<T>(
  responsive: Responsive<T> | T | undefined,
  breakpoint: string,
  value: T | undefined,
): Responsive<T> {
  // If not already a responsive object, convert it
  let result: Responsive<T>;

  if (!responsive || typeof responsive !== "object") {
    result = responsive !== undefined ? { base: responsive as T } : {};
  } else {
    result = { ...responsive } as Responsive<T>;
  }

  // Set or remove the value
  if (value === undefined) {
    delete result[breakpoint];
  } else {
    result[breakpoint] = value;
  }

  return result;
}

/**
 * Convert a plain value to a responsive object with base breakpoint
 *
 * @param value - Plain value
 * @returns Responsive object with base breakpoint
 *
 * @example
 * ```typescript
 * toResponsive('1rem'); // { base: '1rem' }
 * toResponsive({ base: '1rem' }); // { base: '1rem' } (no change)
 * ```
 */
export function toResponsive<T>(
  value: T | Responsive<T> | undefined,
): Responsive<T> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Responsive<T>;
  }
  return { base: value as T };
}

/**
 * Check if a responsive value has any values set
 *
 * @param responsive - Responsive value to check
 * @returns True if has any values
 */
export function hasResponsiveValues<T>(
  responsive: Responsive<T> | T | undefined,
): boolean {
  if (!responsive) return false;
  if (typeof responsive !== "object") return true;
  return Object.keys(responsive as Responsive<T>).length > 0;
}

/**
 * Get all breakpoints that have values set in a responsive object
 *
 * @param responsive - Responsive value
 * @returns Array of breakpoint names with values
 */
export function getActiveBreakpoints<T>(
  responsive: Responsive<T> | T | undefined,
): string[] {
  if (!responsive || typeof responsive !== "object") {
    return responsive !== undefined ? ["base"] : [];
  }
  return Object.keys(responsive as Responsive<T>);
}

/**
 * Merge multiple responsive values, with later values taking precedence
 *
 * @param values - Array of responsive values to merge
 * @returns Merged responsive object
 *
 * @example
 * ```typescript
 * mergeResponsive(
 *   { base: '1rem', md: '2rem' },
 *   { md: '3rem', lg: '4rem' }
 * );
 * // { base: '1rem', md: '3rem', lg: '4rem' }
 * ```
 */
export function mergeResponsive<T>(
  ...values: (Responsive<T> | T | undefined)[]
): Responsive<T> {
  const result: Responsive<T> = {};

  for (const value of values) {
    if (!value) continue;

    if (typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, value);
    } else {
      result.base = value as T;
    }
  }

  return result;
}

/**
 * Get the computed value for a breakpoint, considering cascade
 * (looks for the nearest defined value in the desktop-first cascade)
 *
 * @param responsive - Responsive value
 * @param breakpoint - Target breakpoint
 * @param breakpoints - Breakpoint definitions (for cascade order)
 * @returns Computed value with cascade fallback
 *
 * @example
 * ```typescript
 * const padding = { base: '3rem', tablet: '2rem' };
 * getComputedValue(padding, 'tablet', DEFAULT_BREAKPOINTS); // '2rem'
 * getComputedValue(padding, 'mobile', DEFAULT_BREAKPOINTS); // '2rem'
 * ```
 */
export function getComputedValueSource<T>(
  responsive: Responsive<T> | T | undefined,
  breakpoint: string,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
): { breakpoint: string; value: T } | undefined {
  if (!responsive || typeof responsive !== "object") {
    return responsive === undefined
      ? undefined
      : { breakpoint: DESKTOP_BASE_BREAKPOINT, value: responsive as T };
  }

  const responsiveObj = responsive as Responsive<T>;

  if (responsiveObj[breakpoint] !== undefined) {
    return {
      breakpoint,
      value: responsiveObj[breakpoint] as T,
    };
  }

  const orderedBreakpoints = sortBreakpointDefinitionsDesktopFirst(breakpoints);
  const currentIndex = orderedBreakpoints.findIndex(
    (bp) => bp.name === breakpoint,
  );

  if (currentIndex === -1) {
    if (responsiveObj[DESKTOP_BASE_BREAKPOINT] !== undefined) {
      return {
        breakpoint: DESKTOP_BASE_BREAKPOINT,
        value: responsiveObj[DESKTOP_BASE_BREAKPOINT] as T,
      };
    }

    return undefined;
  }

  for (let index = currentIndex - 1; index >= 0; index--) {
    const candidate = orderedBreakpoints[index];
    if (responsiveObj[candidate.name] !== undefined) {
      return {
        breakpoint: candidate.name,
        value: responsiveObj[candidate.name] as T,
      };
    }
  }

  return undefined;
}

export function getComputedValue<T>(
  responsive: Responsive<T> | T | undefined,
  breakpoint: string,
  breakpoints: BreakpointDefinition[] = DEFAULT_BREAKPOINTS,
): T | undefined {
  return getComputedValueSource(responsive, breakpoint, breakpoints)?.value;
}

/**
 * Create a responsive editor helper
 * Returns functions bound to a specific property for easier editing
 *
 * @param currentValue - Current responsive value
 * @param onChange - Callback when value changes
 * @returns Helper object with get/set functions
 *
 * @example
 * ```typescript
 * const helper = createResponsiveHelper(
 *   node.styles.padding,
 *   (newValue) => updateNodeStyle('padding', newValue)
 * );
 *
 * // Get value for breakpoint
 * const tabletPadding = helper.get('tablet'); // '2rem'
 *
 * // Set value for breakpoint
 * helper.set('desktop', '3rem');
 *
 * // Get all active breakpoints
 * const active = helper.getActive(); // ['base', 'tablet', 'desktop']
 * ```
 */
export function createResponsiveHelper<T>(
  currentValue: Responsive<T> | T | undefined,
  onChange: (newValue: Responsive<T>) => void,
) {
  return {
    /**
     * Get value for a breakpoint
     */
    get(breakpoint: string = "base", fallback?: T): T | undefined {
      return getResponsiveValue(currentValue, breakpoint, fallback);
    },

    /**
     * Set value for a breakpoint
     */
    set(breakpoint: string, value: T | undefined) {
      const newValue = setResponsiveValue(currentValue, breakpoint, value);
      onChange(newValue);
    },

    /**
     * Get computed value (with cascade)
     */
    getComputed(
      breakpoint: string,
      breakpoints?: BreakpointDefinition[],
    ): T | undefined {
      return getComputedValue(currentValue, breakpoint, breakpoints);
    },

    /**
     * Get all active breakpoints
     */
    getActive(): string[] {
      return getActiveBreakpoints(currentValue);
    },

    /**
     * Check if has any values
     */
    hasValues(): boolean {
      return hasResponsiveValues(currentValue);
    },

    /**
     * Convert to responsive object
     */
    toResponsive(): Responsive<T> {
      return toResponsive(currentValue);
    },
  };
}
