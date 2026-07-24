/**
 * Parses UnoCSS utility class strings and converts them to CSS properties.
 * Used for analyzing and transforming utility classes in the visual builder.
 */

import { computed, type ComputedRef } from "vue";
import {
  isLikelyUtilityClassName,
} from "../../../../lib/styles/utilityClassDetection";
import { designTokensState } from "./useDesignTokens";

export interface ParsedUtility {
  className: string;
  property: string;
  value: string;
  /** Responsive variant (sm, md, lg, etc.) */
  variant?: string;
  /** State variant (hover, focus, active, etc.) */
  state?: string;
  isShortcut: boolean;
}

export interface UtilityParseResult {
  parsed: ParsedUtility[];
  /** Classes that couldn't be parsed */
  unknown: string[];
  css: string;
}

const SPACING_PROPERTIES: Record<string, string> = {
  m: "margin",
  mt: "margin-top",
  mr: "margin-right",
  mb: "margin-bottom",
  ml: "margin-left",
  mx: "margin-inline",
  my: "margin-block",
  ms: "margin-inline-start",
  me: "margin-inline-end",
  p: "padding",
  pt: "padding-top",
  pr: "padding-right",
  pb: "padding-bottom",
  pl: "padding-left",
  px: "padding-inline",
  py: "padding-block",
};

const SPACING_UTILITY_PREFIX_PATTERN = "m[trblxy]?|p[trblxy]?|ms|me";

function negateSpacingCSSValue(value: string): string {
  if (value === "auto" || value.startsWith("-")) {
    return value;
  }

  return `-${value}`;
}

const SIZE_PROPERTIES: Record<string, string> = {
  w: "width",
  h: "height",
  "min-w": "min-width",
  "min-h": "min-height",
  "max-w": "max-width",
  "max-h": "max-height",
};

const COLOR_PROPERTIES: Record<string, string> = {
  bg: "background-color",
  text: "color",
  border: "border-color",
};

const FLEX_PROPERTIES: Record<string, Record<string, string>> = {
  "items-start": { "align-items": "flex-start" },
  "items-center": { "align-items": "center" },
  "items-end": { "align-items": "flex-end" },
  "items-stretch": { "align-items": "stretch" },
  "justify-start": { "justify-content": "flex-start" },
  "justify-center": { "justify-content": "center" },
  "justify-end": { "justify-content": "flex-end" },
  "justify-between": { "justify-content": "space-between" },
  "justify-around": { "justify-content": "space-around" },
  "justify-evenly": { "justify-content": "space-evenly" },
};

const DISPLAY_CLASSES: Record<string, string> = {
  block: "block",
  "inline-block": "inline-block",
  inline: "inline",
  flex: "flex",
  "inline-flex": "inline-flex",
  grid: "grid",
  "inline-grid": "inline-grid",
  hidden: "none",
};

const VARIANT_REGEX = /^(sm|md|lg|xl|2xl):/;
const STATE_REGEX =
  /^(hover|focus|active|disabled|visited|first|last|odd|even):/;
function resolveThemeColor(colorToken: string): string | null {
  const [baseToken] = colorToken.split("/");

  const semanticColor =
    designTokensState.semanticColors[
      baseToken as keyof typeof designTokensState.semanticColors
    ];
  if (semanticColor) {
    return semanticColor;
  }

  const themeColors = designTokensState.colors as Record<string, unknown>;
  const directThemeColor = themeColors[baseToken];
  if (typeof directThemeColor === "string") {
    return directThemeColor;
  }

  const paletteEntries = Object.entries(themeColors)
    .filter(([, value]) => value && typeof value === "object")
    .sort(([left], [right]) => right.length - left.length);

  for (const [paletteName, paletteValue] of paletteEntries) {
    const palette = paletteValue as Record<string, string>;

    if (baseToken === paletteName) {
      return palette.DEFAULT ?? palette["500"] ?? null;
    }

    if (!baseToken.startsWith(`${paletteName}-`)) {
      continue;
    }

    const shade = baseToken.slice(paletteName.length + 1);
    if (shade in palette) {
      return palette[shade];
    }
  }

  return null;
}

/**
 * Utility parser for analyzing and transforming UnoCSS classes
 *
 * @example
 * ```ts
 * const { parseUtility, parseClassList, expandShortcut } = useUtilityParser();
 *
 * const result = parseClassList('flex items-center p-4 bg-primary');
 * console.log(result.css); // Generated CSS
 * ```
 */
export function useUtilityParser() {

  /**
   * Parse a single utility class
   */
  function parseUtility(className: string): ParsedUtility | null {
    let workingClass = className;
    let variant: string | undefined;
    let state: string | undefined;

    const variantMatch = workingClass.match(VARIANT_REGEX);
    if (variantMatch) {
      variant = variantMatch[1];
      workingClass = workingClass.replace(VARIANT_REGEX, "");
    }

    const stateMatch = workingClass.match(STATE_REGEX);
    if (stateMatch) {
      state = stateMatch[1];
      workingClass = workingClass.replace(STATE_REGEX, "");
    }

    // Check if it's a shortcut
    if (designTokensState.shortcuts[workingClass]) {
      return {
        className,
        property: "shortcut",
        value: designTokensState.shortcuts[workingClass],
        variant,
        state,
        isShortcut: true,
      };
    }

    if (DISPLAY_CLASSES[workingClass]) {
      return {
        className,
        property: "display",
        value: DISPLAY_CLASSES[workingClass],
        variant,
        state,
        isShortcut: false,
      };
    }

    if (FLEX_PROPERTIES[workingClass]) {
      const props = FLEX_PROPERTIES[workingClass];
      const [property, value] = Object.entries(props)[0];
      return {
        className,
        property,
        value,
        variant,
        state,
        isShortcut: false,
      };
    }

    // Parse spacing utilities (m-4, -mt-4, p-2, -ms-4, etc.)
    const spacingMatch = workingClass.match(
      new RegExp(`^(-?)(${SPACING_UTILITY_PREFIX_PATTERN})-(.+)$`),
    );
    if (spacingMatch) {
      const [, negativePrefix, prefix, size] = spacingMatch;
      const property = SPACING_PROPERTIES[prefix];
      let value = designTokensState.spacing[size] || size;
      if (negativePrefix) {
        value = negateSpacingCSSValue(value);
      }
      if (property) {
        return {
          className,
          property,
          value,
          variant,
          state,
          isShortcut: false,
        };
      }
    }

    // Parse size utilities (w-full, h-screen, etc.)
    const sizeMatch = workingClass.match(
      /^(w|h|min-w|min-h|max-w|max-h)-(.+)$/,
    );
    if (sizeMatch) {
      const [, prefix, size] = sizeMatch;
      const property = SIZE_PROPERTIES[prefix];
      let value = size;
      if (size === "full") value = "100%";
      else if (size === "screen")
        value = prefix.startsWith("w") ? "100vw" : "100vh";
      else if (designTokensState.spacing[size])
        value = designTokensState.spacing[size];
      if (property) {
        return {
          className,
          property,
          value,
          variant,
          state,
          isShortcut: false,
        };
      }
    }

    // Parse color utilities (bg-primary, text-muted, etc.)
    const colorMatch = workingClass.match(/^(bg|text|border)-(.+)$/);
    if (colorMatch) {
      const [, prefix, colorName] = colorMatch;
      const property = COLOR_PROPERTIES[prefix];
      const value = resolveThemeColor(colorName);
      if (value) {
        return {
          className,
          property,
          value,
          variant,
          state,
          isShortcut: false,
        };
      }
    }

    const radiusMatch = workingClass.match(/^rounded(-(.+))?$/);
    if (radiusMatch) {
      const size = radiusMatch[2] || "DEFAULT";
      const value = designTokensState.effects.borderRadius[size];
      if (value) {
        return {
          className,
          property: "border-radius",
          value,
          variant,
          state,
          isShortcut: false,
        };
      }
    }

    const shadowMatch = workingClass.match(/^shadow(-(.+))?$/);
    if (shadowMatch) {
      const size = shadowMatch[2] || "DEFAULT";
      const value = designTokensState.effects.shadows[size];
      if (value) {
        return {
          className,
          property: "box-shadow",
          value,
          variant,
          state,
          isShortcut: false,
        };
      }
    }

    return null;
  }

  /**
   * Parse a space-separated list of utility classes
   */
  function parseClassList(classList: string): UtilityParseResult {
    const classes = classList.split(/\s+/).filter(Boolean);
    const parsed: ParsedUtility[] = [];
    const unknown: string[] = [];

    for (const className of classes) {
      const result = parseUtility(className);
      if (result) {
        parsed.push(result);
      } else {
        unknown.push(className);
      }
    }

    const cssRules: string[] = [];
    for (const utility of parsed) {
      if (!utility.isShortcut) {
        cssRules.push(`${utility.property}: ${utility.value};`);
      }
    }

    return {
      parsed,
      unknown,
      css: cssRules.join("\n"),
    };
  }

  /**
   * Expand a shortcut to its constituent classes
   */
  function expandShortcut(shortcutName: string): string[] {
    const value = designTokensState.shortcuts[shortcutName];
    if (!value) return [];
    return value.split(/\s+/).filter(Boolean);
  }

  /**
   * Check if a class is a valid utility
   */
  function isValidUtility(className: string): boolean {
    return parseUtility(className) !== null;
  }

  /**
   * /** Broader utility detection for legacy cleanup and migration
   * surfaces. This intentionally recognizes utility-like tokens that the strict.
   */
  function isLikelyUtilityClass(className: string): boolean {
    if (isValidUtility(className)) {
      return true;
    }

    return isLikelyUtilityClassName(className);
  }

  /**
   * Get all available shortcuts
   */
  const availableShortcuts: ComputedRef<string[]> = computed(() => {
    return Object.keys(designTokensState.shortcuts);
  });

  return {
    parseUtility,
    parseClassList,
    expandShortcut,
    isValidUtility,
    isLikelyUtilityClass,
    availableShortcuts,
  };
}
