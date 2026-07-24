/**
 * Classes - Custom fonts (uploaded files) - Google Fonts integration.
 */

import type {
  CustomClass as NewCustomClass,
  FrameworkMode,
} from "../schemas/classEditor";

/**
 * A custom CSS class created by the user When a user creates a class (e. g.
 */
export interface CustomClass {
  id: string;

  /** Class name (e.g., "hero-heading", "btn-primary") */
  name: string;

  /** CSS properties as key-value pairs */
  css: Record<string, string>;

  usageCount: number;

  createdAt: string;

  updatedAt: string;
}

/**
 * Collection of all custom classes
 */
export interface CustomClassLibrary {
  /** Map of class name → class definition */
  classes: Record<string, CustomClass>;
}

export interface CustomFont {
  id: string;

  name: string;

  /** CSS font-family value (e.g., "My Custom Font") */
  family: string;

  formats: Array<{
    /** Format type (e.g., "woff2", "woff", "ttf") */
    format: string;
    /** Public URL to the font file (e.g., "/uploads/font.woff2") */
    url: string;
  }>;

  /** Font weight (e.g., "400", "700") */
  weight?: string;

  /** Font style (e.g., "normal", "italic") */
  style?: string;
}

export interface GoogleFont {
  id: string;

  /** Google Font family name (e.g., "Roboto") */
  family: string;

  /** Selected variants (e.g., ["400", "700", "400italic"]) */
  variants: string[];

  googleFontsURL: string;
}

/**
 * Collection of all custom and Google fonts
 */
export interface CustomFontsLibrary {
  /** Map of font ID → custom font definition */
  fonts: Record<string, CustomFont>;

  /** Map of font ID → Google font definition */
  googleFonts: Record<string, GoogleFont>;
}

/**
 * Extended StylesData interface with compilation fields
 * Matches the schema in aria/lib/schemas/storage.ts
 */
export interface StylesData {
  /** Design tokens (colors, spacing, etc.) */
  tokens?: {
    colors: Record<string, string>;
    gradients: Record<string, string>;
    spacing: Record<string, string>;
    fonts: Record<string, string>;
    fontSizes: Record<string, string>;
    fontWeights: Record<string, string>;
    lineHeights: Record<string, string>;
    letterSpacing: Record<string, string>;
    borderWidths: Record<string, string>;
    borderColors: Record<string, string>;
    borderRadius: Record<string, string>;
    boxShadows: Record<string, string>;
    opacity: Record<string, string>;
    zIndex: Record<string, number>;
    transitions: Record<string, string>;
    breakpoints: Record<string, string>;
  };

  customFonts?: CustomFontsLibrary;

  customClasses?: Record<string, NewCustomClass>;

  frameworkMode?: FrameworkMode;

  /** Compiled UnoCSS (from scanning DSL) */
  compiledUnoCSS?: string;

  baseCSS?: string;

  /** Hash of baseCSS for cache busting */
  baseCSSHash?: string;

  utilityCSS?: string;

  /** Hash of utilityCSS for cache busting */
  utilityCSSHash?: string;

  customClassesCSS?: string;

  /** Generated CSS for custom fonts (@font-face rules) */
  customFontsCSS?: string;

  /** Combined global CSS (UnoCSS + fonts + classes) */
  globalCSS?: string;

  /** Hash of globalCSS for cache busting */
  globalCSSHash?: string;

  unocssClasses?: string[];

  /** ISO timestamp of last CSS compilation */
  lastCompiled?: string;
}

/**
 * Helper to convert camelCase CSS property to kebab-case
 *
 * @example
 * camelToKebab('fontSize') // 'font-size'
 * camelToKebab('backgroundColor') // 'background-color'
 */
export function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Helper to convert kebab-case CSS property to camelCase
 *
 * @example
 * kebabToCamel('font-size') // 'fontSize'
 * kebabToCamel('background-color') // 'backgroundColor'
 */
export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Canonical property name for stored class rules (camelCase; CSS vars unchanged).
 */
export function normalizeStoredCssProperty(property: string): string {
  if (property.startsWith("--")) {
    return property;
  }

  return kebabToCamel(property);
}

/**
 * CSS property name for raw editor display (kebab-case; CSS vars unchanged).
 */
export function formatCssPropertyForEditor(property: string): string {
  if (property.startsWith("--")) {
    return property;
  }

  return camelToKebab(property);
}

/**
 * Whether two stored/editor property names refer to the same CSS property.
 */
export function cssPropertiesEquivalent(
  left: string,
  right: string,
): boolean {
  return normalizeStoredCssProperty(left) === normalizeStoredCssProperty(right);
}

export interface NormalizableCssRule {
  property: string;
  value: string;
  important: boolean;
}

/**
 * Normalize property keys and dedupe rules (last declaration wins).
 */
export function normalizeCssRuleList<T extends NormalizableCssRule>(
  rules: readonly T[],
): T[] {
  const byProperty = new Map<string, T>();

  for (const rule of rules) {
    const property = normalizeStoredCssProperty(rule.property);
    byProperty.set(property, { ...rule, property });
  }

  return Array.from(byProperty.values());
}

/**
 * Parse CSS string into property object
 *
 * @example
 * parseCSSString('font-size: 70px; font-weight: 700;')
 * // Returns { fontSize: '70px', fontWeight: '700' }
 */
export function parseCSSString(css: string): Record<string, string> {
  const properties: Record<string, string> = {};

  css
    .split(";")
    .map((prop) => prop.trim())
    .filter(Boolean)
    .forEach((prop) => {
      const [key, value] = prop.split(":").map((s) => s.trim());
      if (key && value) {
        properties[kebabToCamel(key)] = value;
      }
    });

  return properties;
}

/**
 * Convert property object to CSS string
 *
 * @example
 * toCSSString({ fontSize: '70px', fontWeight: '700' })
 * // Returns 'font-size: 70px; font-weight: 700;'
 */
export function toCSSString(properties: Record<string, string>): string {
  return Object.entries(properties)
    .map(([key, value]) => `${camelToKebab(key)}: ${value};`)
    .join(" ");
}
