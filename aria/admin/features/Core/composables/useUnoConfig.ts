/**
 * Converts the internal design system state (palettes, semantic colors, typography,
 * spacing) to UnoCSS runtime config format for iframe injection.
 */

import { computed, watch, type ComputedRef } from "vue";
import { designTokensState } from "../../Design";
import { useCanonicalBreakpoints } from "../../../composables/useCanonicalBreakpoints";
import {
  COLOR_SHADES,
  type ColorPaletteShades,
  type SemanticColors,
} from "../../../../lib/design/types";
import { generateNaturalShades } from "../../../../lib/design/shades";
import { SEMANTIC_CSS_VAR_BY_KEY } from "../../Design/lib/designSystemColorVariables";
import {
  buildRuntimeShortcutSafelist,
  RUNTIME_SAFE_CONTAINER_SHORTCUT,
} from "../../../../lib/styles/unoRuntimeDefaults";
import { NON_CONFLICTING_SEMANTIC_UNO_COLORS } from "../../../../lib/styles/unoSystemDefaults";
import { log } from "@/lib/utils/logger";
import { useStageSignalBridge } from "./useStageSignalBridge";

/**
 * UnoCSS Runtime Theme Configuration
 * This is the format expected by @unocss/runtime's __unocss global
 */
export interface UnoRuntimeTheme {
  colors: Record<string, ColorPaletteShades | string>;
  /** preset-wind v66 theme key (matches uno.aria.config.ts) */
  breakpoint?: Record<string, string>;
  fontFamily?: Record<string, string[]>;
  spacing?: Record<string, string>;
  borderRadius?: Record<string, string>;
  boxShadow?: Record<string, string>;
}

export interface UnoRuntimeConfig {
  theme: UnoRuntimeTheme;
  shortcuts?: Record<string, string>;
  safelist?: string[];
  presets?: unknown[]; // Runtime presets (set by loading preset scripts)
}

export interface UseUnoConfigReturn {
  /** Computed UnoCSS runtime config ready for iframe injection */
  unoRuntimeConfig: ComputedRef<UnoRuntimeConfig>;

  themeColors: ComputedRef<Record<string, ColorPaletteShades | string>>;

  /** Just the breakpoints in UnoCSS format */
  themeBreakpoints: ComputedRef<Record<string, string>>;

  configJSON: ComputedRef<string>;

  cssVariables: ComputedRef<string>;

  /** Signal that config has changed (for StageFrame to listen) */
  notifyConfigChanged: () => void;
}

let isInitialized = false;
let cachedReturn: UseUnoConfigReturn | null = null;

const HEX_COLOR_RE = /^#([a-f\d]{3}|[a-f\d]{6})$/i;
const RGB_COLOR_RE =
  /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})(?:\s*[,/]\s*[\d.]+)?\s*\)$/i;
const HSL_CHANNELS_RE = /^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/i;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rgbToHslChannels(red: number, green: number, blue: number): string {
  const r = clamp01(red / 255);
  const g = clamp01(green / 255);
  const b = clamp01(blue / 255);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
  }

  hue = Math.round((hue * 60 + 360) % 360);
  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return `${hue} ${(saturation * 100).toFixed(1)}% ${(lightness * 100).toFixed(1)}%`;
}

function normalizeToHslChannels(value: string, fallback: string): string {
  const color = value.trim();
  if (!color) return fallback;

  // Already in channel form: "240 5.9% 10%"
  if (HSL_CHANNELS_RE.test(color)) {
    return color;
  }

  // hsl(...) or hsla(...)
  const hslMatch = color.match(/^hsla?\((.+)\)$/i);
  if (hslMatch) {
    const inner = hslMatch[1].split("/")[0].trim().replace(/,/g, " ");
    const parts = inner.split(/\s+/).filter(Boolean);
    if (parts.length >= 3 && parts[1].includes("%") && parts[2].includes("%")) {
      return `${parts[0]} ${parts[1]} ${parts[2]}`;
    }
  }

  // #rgb / #rrggbb
  if (HEX_COLOR_RE.test(color)) {
    const hex = color.slice(1);
    const expanded =
      hex.length === 3
        ? hex
            .split("")
            .map((char) => `${char}${char}`)
            .join("")
        : hex;

    const red = parseInt(expanded.slice(0, 2), 16);
    const green = parseInt(expanded.slice(2, 4), 16);
    const blue = parseInt(expanded.slice(4, 6), 16);

    return rgbToHslChannels(red, green, blue);
  }

  // rgb(...) / rgba(...)
  const rgbMatch = color.match(RGB_COLOR_RE);
  if (rgbMatch) {
    const red = Number(rgbMatch[1]);
    const green = Number(rgbMatch[2]);
    const blue = Number(rgbMatch[3]);

    if (
      Number.isFinite(red) &&
      Number.isFinite(green) &&
      Number.isFinite(blue)
    ) {
      return rgbToHslChannels(red, green, blue);
    }
  }

  return fallback;
}

function normalizeToCssColor(value: string, fallbackChannels: string): string {
  const color = value.trim();
  if (!color) {
    return `hsl(${fallbackChannels})`;
  }

  if (HSL_CHANNELS_RE.test(color)) {
    return `hsl(${color})`;
  }

  return color;
}

function isSelfReferentialSemanticColor(
  value: string,
  tokenName: string,
): boolean {
  const normalizedValue = value.trim().toLowerCase().replace(/\s+/g, "");
  const normalizedTokenName = tokenName.trim().toLowerCase();

  if (!normalizedValue || !normalizedTokenName) {
    return false;
  }

  return (
    normalizedValue.includes(`var(--${normalizedTokenName})`) ||
    normalizedValue.includes(`var(--color-${normalizedTokenName})`)
  );
}

function getHydratedSemanticColorValue(
  value: string,
  tokenName: string,
): string | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (isSelfReferentialSemanticColor(trimmedValue, tokenName)) {
    return null;
  }

  return trimmedValue;
}

export function useUnoConfig(): UseUnoConfigReturn {
  // Return cached instance if already initialized
  if (isInitialized && cachedReturn) {
    return cachedReturn;
  }

  const { unoBreakpoints } = useCanonicalBreakpoints({ autoLoad: true });
  const { signalUnoConfigChanged } = useStageSignalBridge();

  // COMPUTED: Convert internal state to UnoCSS format

  /**
   * Convert palettes + semantic colors to UnoCSS theme.colors format
   */
  const themeColors = computed<Record<string, ColorPaletteShades | string>>(
    () => {
      const colors: Record<string, ColorPaletteShades | string> = {};

      // Add palette colors (primary, secondary, accent, neutral, etc.)
      const unoColors = designTokensState.colors;
      for (const [name, value] of Object.entries(unoColors)) {
        if (value && typeof value === "object") {
          // It's a palette with shades
          colors[name] = value as ColorPaletteShades;
        } else if (typeof value === "string") {
          // It's a single color (semantic)
          colors[name] = value;
        }
      }

      return colors;
    },
  );

  /**
   * Convert viewport/breakpoint definitions to UnoCSS breakpoints format
   * UnoCSS expects: { sm: '640px', md: '768px', ... }
   */
  const themeBreakpoints = computed<Record<string, string>>(() => {
    return { ...unoBreakpoints.value };
  });

  /**
   * Convert typography config to UnoCSS format
   */
  const themeFontFamily = computed<Record<string, string[]>>(() => {
    return designTokensState.typography.fontFamilies;
  });

  /**
   * Convert spacing config to UnoCSS format
   */
  const themeSpacing = computed<Record<string, string>>(() => {
    const spacing: Record<string, string> = {};
    for (const [key, value] of Object.entries(designTokensState.spacing)) {
      spacing[String(key)] = value;
    }
    return spacing;
  });

  /**
   * Convert effects config to UnoCSS format
   */
  const themeBorderRadius = computed<Record<string, string>>(() => {
    return designTokensState.effects.borderRadius;
  });

  const themeBoxShadow = computed<Record<string, string>>(() => {
    return designTokensState.effects.shadows;
  });

  /**
   * CSS variables for semantic colors (card, card-foreground, etc.)
   * These are needed because shortcuts use bg-card, text-card-foreground, etc.
   */
  const cssVariables = computed<string>(() => {
    const colors = themeColors.value;
    const semanticColors = designTokensState.semanticColors;
    const lines: string[] = [];
    const backgroundValue = getHydratedSemanticColorValue(
      String(semanticColors.background ?? ""),
      "background",
    );
    const foregroundValue = getHydratedSemanticColorValue(
      String(semanticColors.foreground ?? ""),
      "foreground",
    );

    // Add CSS variables for semantic colors that use CSS var() references
    // These map the design system colors to CSS custom properties
    lines.push(":root {");

    // Map palette colors to CSS variables
    for (const [name, value] of Object.entries(colors)) {
      if (typeof value === "object") {
        // It's a palette with shades - create variables for each shade
        for (const [shade, color] of Object.entries(value)) {
          if (shade === "DEFAULT") {
            lines.push(`  --color-${name}: ${color};`);
            lines.push(`  --${name}: ${color};`);
          } else {
            lines.push(`  --color-${name}-${shade}: ${color};`);
            lines.push(`  --${name}-${shade}: ${color};`);
          }
        }
      } else if (typeof value === "string") {
        // It's a single color (semantic)
        lines.push(`  --${name}: ${value};`);
      }
    }

    const injectedDesignSemanticVars = new Set<string>();

    for (const semanticKey of Object.keys(SEMANTIC_CSS_VAR_BY_KEY) as Array<
      keyof SemanticColors
    >) {
      const cssVar = SEMANTIC_CSS_VAR_BY_KEY[semanticKey];
      const tokenColor = colors[semanticKey];
      const hex =
        typeof tokenColor === "string" ? tokenColor.trim() : "";
      if (!hex) {
        continue;
      }

      lines.push(`  --${cssVar}: ${hex};`);
      injectedDesignSemanticVars.add(cssVar);
      const generatedShades = generateNaturalShades(hex);
      for (const shade of COLOR_SHADES) {
        const shadeColor = generatedShades[shade]?.trim();
        if (shadeColor) {
          lines.push(`  --${cssVar}-${shade}: ${shadeColor};`);
        }
      }
    }

    // Add semantic color mappings if not already defined
    // These are the Tailwind/shadcn semantic colors
    const semanticDefaults: Record<string, string | null> = {
      background: backgroundValue
        ? normalizeToHslChannels(backgroundValue, "0 0% 100%")
        : null,
      foreground: foregroundValue
        ? normalizeToHslChannels(foregroundValue, "240 10% 3.9%")
        : null,
      card: normalizeToHslChannels(
        String(semanticColors.card ?? ""),
        "0 0% 100%",
      ),
      "card-foreground": normalizeToHslChannels(
        String(semanticColors["card-foreground"] ?? ""),
        "240 10% 3.9%",
      ),
      popover: "0 0% 100%",
      "popover-foreground": "240 10% 3.9%",
      primary: normalizeToHslChannels(
        String(semanticColors.primary ?? colors.primary?.["500"] ?? ""),
        "217.2 91.2% 59.8%",
      ),
      "primary-foreground": normalizeToHslChannels(
        String(semanticColors["primary-foreground"] ?? ""),
        "0 0% 98%",
      ),
      secondary: normalizeToHslChannels(
        String(semanticColors.secondary ?? colors.neutral?.["100"] ?? ""),
        "240 4.8% 95.9%",
      ),
      "secondary-foreground": normalizeToHslChannels(
        String(semanticColors["secondary-foreground"] ?? ""),
        "240 5.9% 10%",
      ),
      muted: normalizeToHslChannels(
        String(semanticColors.muted ?? colors.neutral?.["100"] ?? ""),
        "240 4.8% 95.9%",
      ),
      "muted-foreground": normalizeToHslChannels(
        String(
          semanticColors["muted-foreground"] ?? colors.neutral?.["500"] ?? "",
        ),
        "240 3.8% 46.1%",
      ),
      accent: normalizeToHslChannels(
        String(semanticColors.accent ?? colors.neutral?.["100"] ?? ""),
        "240 4.8% 95.9%",
      ),
      "accent-foreground": normalizeToHslChannels(
        String(semanticColors["accent-foreground"] ?? ""),
        "240 5.9% 10%",
      ),
      destructive: normalizeToHslChannels(
        String(semanticColors.destructive ?? ""),
        "0 84.2% 60.2%",
      ),
      "destructive-foreground": normalizeToHslChannels(
        String(semanticColors["destructive-foreground"] ?? ""),
        "0 0% 98%",
      ),
      border: normalizeToHslChannels(
        String(semanticColors.border ?? colors.neutral?.["200"] ?? ""),
        "240 5.9% 90%",
      ),
      input: normalizeToHslChannels(
        String(semanticColors.input ?? colors.neutral?.["200"] ?? ""),
        "240 5.9% 90%",
      ),
      ring: normalizeToHslChannels(
        String(semanticColors.ring ?? colors.primary?.["500"] ?? ""),
        "217.2 91.2% 59.8%",
      ),
    };

    for (const [name, defaultValue] of Object.entries(semanticDefaults)) {
      // Only add if not already defined from design system
      if (
        injectedDesignSemanticVars.has(name) ||
        colors[name] ||
        typeof defaultValue !== "string"
      ) {
        continue;
      }

      lines.push(`  --${name}: ${defaultValue};`);
    }

    if (backgroundValue && typeof semanticDefaults.background === "string") {
      lines.push(
        `  --color-background: ${normalizeToCssColor(backgroundValue, semanticDefaults.background)};`,
      );
    }
    if (foregroundValue && typeof semanticDefaults.foreground === "string") {
      lines.push(
        `  --color-foreground: ${normalizeToCssColor(foregroundValue, semanticDefaults.foreground)};`,
      );
    }

    lines.push("}");

    lines.push(".dark {");
    const darkDefaults: Record<string, string> = {
      background: "240 10% 3.9%",
      foreground: "0 0% 98%",
      card: "240 10% 3.9%",
      "card-foreground": "0 0% 98%",
      popover: "240 10% 3.9%",
      "popover-foreground": "0 0% 98%",
      primary: normalizeToHslChannels(
        String(colors.primary?.["500"] ?? ""),
        "217.2 91.2% 59.8%",
      ),
      "primary-foreground": "0 0% 98%",
      secondary: normalizeToHslChannels(
        String(colors.neutral?.["800"] ?? ""),
        "240 3.7% 15.9%",
      ),
      "secondary-foreground": "0 0% 98%",
      muted: normalizeToHslChannels(
        String(colors.neutral?.["800"] ?? ""),
        "240 3.7% 15.9%",
      ),
      "muted-foreground": normalizeToHslChannels(
        String(colors.neutral?.["400"] ?? ""),
        "240 5% 64.9%",
      ),
      accent: normalizeToHslChannels(
        String(colors.neutral?.["800"] ?? ""),
        "240 3.7% 15.9%",
      ),
      "accent-foreground": "0 0% 98%",
      destructive: "0 62.8% 30.6%",
      "destructive-foreground": "0 0% 98%",
      border: normalizeToHslChannels(
        String(colors.neutral?.["800"] ?? ""),
        "240 3.7% 15.9%",
      ),
      input: normalizeToHslChannels(
        String(colors.neutral?.["800"] ?? ""),
        "240 3.7% 15.9%",
      ),
      ring: normalizeToHslChannels(
        String(colors.primary?.["400"] ?? ""),
        "217.2 91.2% 59.8%",
      ),
    };

    for (const [name, value] of Object.entries(darkDefaults)) {
      lines.push(`  --${name}: ${value};`);
    }
    lines.push("}");

    return lines.join("\n");
  });

  /**
   * Full UnoCSS runtime config object
   */
  const unoRuntimeConfig = computed<UnoRuntimeConfig>(() => {
    const shortcuts = {
      ...designTokensState.shortcuts,
      container: RUNTIME_SAFE_CONTAINER_SHORTCUT,
    };

    return {
      theme: {
        colors: {
          ...themeColors.value,
          // Preserve palette names like primary/secondary/accent for utilities.
          // Only add semantic aliases that do not collide with palette keys.
          ...NON_CONFLICTING_SEMANTIC_UNO_COLORS,
        },
        breakpoint: themeBreakpoints.value,
        fontFamily: themeFontFamily.value,
        spacing: themeSpacing.value,
        borderRadius: themeBorderRadius.value,
        boxShadow: themeBoxShadow.value,
      },
      shortcuts,
      safelist: buildRuntimeShortcutSafelist(designTokensState.shortcuts),
    };
  });

  /**
   * Serialized JSON string for script injection
   * Safe for embedding in HTML script tags
   */
  const configJSON = computed<string>(() => {
    try {
      return JSON.stringify(unoRuntimeConfig.value);
    } catch (e) {
      log("error", "[useUnoConfig] Failed to serialize config", {
        error: e instanceof Error ? e.message : String(e),
      });
      return "{}";
    }
  });

  // SIGNAL: Notify listeners when config changes

  /**
   * Emit signal that config has changed
   * StageFrame listens for this to update iframe's __unocss
   */
  const notifyConfigChanged = () => {
    signalUnoConfigChanged({
      configJSON: configJSON.value,
      timestamp: Date.now(),
    });
  };

  // WATCHERS: Auto-notify on relevant changes

  // Watch for color changes
  watch(
    () => designTokensState.colors,
    () => {
      notifyConfigChanged();
    },
    { deep: true },
  );

  // Watch for breakpoint changes from the canonical design system
  watch(
    themeBreakpoints,
    () => {
      notifyConfigChanged();
    },
    { deep: true },
  );

  // Watch for typography changes
  watch(
    () => designTokensState.typography,
    () => {
      notifyConfigChanged();
    },
    { deep: true },
  );

  // Watch for spacing changes
  watch(
    () => designTokensState.spacing,
    () => {
      notifyConfigChanged();
    },
    { deep: true },
  );

  // Watch for effects changes
  watch(
    () => designTokensState.effects,
    () => {
      notifyConfigChanged();
    },
    { deep: true },
  );

  cachedReturn = {
    unoRuntimeConfig,
    themeColors,
    themeBreakpoints,
    configJSON,
    cssVariables,
    notifyConfigChanged,
  };
  isInitialized = true;

  return cachedReturn;
}
