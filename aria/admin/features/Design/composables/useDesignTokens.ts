/**
 * Design token configuration state for colors, typography, spacing, and effects. This
 * is the core state management for the UnoCSS configuration system.
 */

import { reactive, readonly, type DeepReadonly } from "vue";
import { RUNTIME_SAFE_CONTAINER_SHORTCUT } from "../../../../lib/styles/unoRuntimeDefaults";
import { SYSTEM_BUTTON_SHORTCUTS } from "../../../../lib/styles/unoSystemDefaults";

export interface ColorScale {
  25: string;
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

export interface SemanticColors {
  background: string;
  foreground: string;
  primary: string;
  "primary-foreground": string;
  secondary: string;
  "secondary-foreground": string;
  muted: string;
  "muted-foreground": string;
  accent: string;
  "accent-foreground": string;
  destructive: string;
  "destructive-foreground": string;
  border: string;
  input: string;
  ring: string;
  card: string;
  "card-foreground": string;
}

export interface TypographyConfig {
  fontFamilies: Record<string, string[]>;
  fontSizes: Record<string, [string, { lineHeight: string }]>;
  letterSpacing: Record<string, string>;
}

export interface EffectsConfig {
  shadows: Record<string, string>;
  borderRadius: Record<string, string>;
  blur: Record<string, string>;
}

export type DesignTokenColorValue = ColorScale | string;

export interface DesignTokenColors extends Record<
  string,
  DesignTokenColorValue
> {
  primary: ColorScale;
  secondary: ColorScale;
  accent: string;
  warning: string;
  danger: string;
  success: string;
}

export interface DesignTokensState {
  colors: DesignTokenColors;
  semanticColors: SemanticColors;
  typography: TypographyConfig;
  spacing: Record<string | number, string>;
  effects: EffectsConfig;
  breakpoints: Record<string, string>;
  shortcuts: Record<string, string>;
  animations: Record<string, string>;
  keyframes: Record<string, Record<string, Record<string, string>>>;
}

const DEFAULT_COLORS = {
  primary: {
    25: "#f8fbff",
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
    950: "#172554",
  },
  secondary: {
    25: "#fcfdfe",
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617",
  },
  accent: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  success: "#10b981",
};

const DEFAULT_SEMANTIC_COLORS: SemanticColors = {
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  primary: "hsl(var(--primary))",
  "primary-foreground": "hsl(var(--primary-foreground))",
  secondary: "hsl(var(--secondary))",
  "secondary-foreground": "hsl(var(--secondary-foreground))",
  muted: "hsl(var(--muted))",
  "muted-foreground": "hsl(var(--muted-foreground))",
  accent: "hsl(var(--accent))",
  "accent-foreground": "hsl(var(--accent-foreground))",
  destructive: "hsl(var(--destructive))",
  "destructive-foreground": "hsl(var(--destructive-foreground))",
  border: "hsl(var(--border))",
  input: "hsl(var(--input))",
  ring: "hsl(var(--ring))",
  card: "hsl(var(--card))",
  "card-foreground": "hsl(var(--card-foreground))",
};

const DEFAULT_TYPOGRAPHY: TypographyConfig = {
  fontFamilies: {
    sans: ["Outfit", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
    serif: ["Charter", "Georgia", "serif"],
    mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
  },
  fontSizes: {
    xs: ["0.75rem", { lineHeight: "1rem" }],
    sm: ["0.875rem", { lineHeight: "1.25rem" }],
    base: ["1rem", { lineHeight: "1.5rem" }],
    lg: ["1.125rem", { lineHeight: "1.75rem" }],
    xl: ["1.25rem", { lineHeight: "1.75rem" }],
    "2xl": ["1.5rem", { lineHeight: "2rem" }],
    "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
    "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
    "5xl": ["3rem", { lineHeight: "1" }],
    "6xl": ["3.75rem", { lineHeight: "1" }],
    "7xl": ["4.5rem", { lineHeight: "1" }],
    "8xl": ["6rem", { lineHeight: "1" }],
    "9xl": ["8rem", { lineHeight: "1" }],
  },
  letterSpacing: {
    tighter: "-0.05em",
    tight: "-0.025em",
    normal: "0em",
    wide: "0.025em",
    wider: "0.05em",
    widest: "0.1em",
  },
};

const DEFAULT_SPACING: Record<string | number, string> = {
  px: "1px",
  0: "0px",
  0.5: "0.125rem",
  1: "0.25rem",
  1.5: "0.375rem",
  2: "0.5rem",
  2.5: "0.625rem",
  3: "0.75rem",
  3.5: "0.875rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  7: "1.75rem",
  8: "2rem",
  9: "2.25rem",
  10: "2.5rem",
  11: "2.75rem",
  12: "3rem",
  14: "3.5rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
  28: "7rem",
  32: "8rem",
  36: "9rem",
  40: "10rem",
  44: "11rem",
  48: "12rem",
  52: "13rem",
  56: "14rem",
  60: "15rem",
  64: "16rem",
  72: "18rem",
  80: "20rem",
  96: "24rem",
};

const DEFAULT_EFFECTS: EffectsConfig = {
  shadows: {
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    DEFAULT:
      "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
    "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)",
    none: "none",
  },
  borderRadius: {
    none: "0px",
    sm: "0.125rem",
    DEFAULT: "0.25rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.75rem",
    "2xl": "1rem",
    "3xl": "1.5rem",
    full: "9999px",
  },
  blur: {
    none: "0",
    sm: "4px",
    DEFAULT: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    "2xl": "40px",
    "3xl": "64px",
  },
};

const DEFAULT_BREAKPOINTS: Record<string, string> = {
  tablet: "768px",
  desktop: "1280px",
};

const DEFAULT_SHORTCUTS: Record<string, string> = {
  ...SYSTEM_BUTTON_SHORTCUTS,

  "btn-sm": "px-3 py-1.5 text-sm",
  "btn-lg": "px-8 py-3 text-lg",
  "btn-icon": "h-10 w-10",

  card: "rounded-lg border bg-card text-card-foreground shadow-sm",
  "card-elevated": "card shadow-lg hover:shadow-xl transition-shadow",
  "card-interactive": "card hover:bg-muted/50 cursor-pointer transition-colors",

  input:
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  "input-error": "input border-destructive focus-visible:ring-destructive",
  "input-success": "input border-green-500 focus-visible:ring-green-500",

  badge:
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  "badge-default":
    "badge border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
  "badge-secondary":
    "badge border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  "badge-destructive":
    "badge border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
  "badge-outline": "badge text-foreground",

  container: RUNTIME_SAFE_CONTAINER_SHORTCUT,
  "container-sm": "max-w-sm",
  "container-md": "max-w-md",
  "container-lg": "max-w-lg",
  "container-xl": "max-w-xl",
  "container-2xl": "max-w-2xl",
  "container-3xl": "max-w-3xl",
  "container-4xl": "max-w-4xl",
  "container-5xl": "max-w-5xl",
  "container-6xl": "max-w-6xl",
  "container-7xl": "max-w-7xl",

  heading: "font-semibold tracking-tight",
  "heading-1": "heading text-4xl lg:text-5xl",
  "heading-2": "heading text-3xl lg:text-4xl",
  "heading-3": "heading text-2xl lg:text-3xl",
  "heading-4": "heading text-xl lg:text-2xl",
  "heading-5": "heading text-lg lg:text-xl",
  "heading-6": "heading text-base lg:text-lg",

  "text-large": "text-lg text-muted-foreground",
  "text-small": "text-sm text-muted-foreground",
  "text-muted": "text-sm text-muted-foreground",
  "text-lead": "text-xl text-muted-foreground",

  "nav-link": "text-foreground/60 transition-colors hover:text-foreground/80",
  "nav-link-active": "text-foreground font-medium",

  label:
    "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
  "form-item": "space-y-2",
  "form-message": "text-sm font-medium text-destructive",

  skeleton: "animate-pulse rounded-md bg-muted",
  loading:
    "animate-spin rounded-full border-2 border-current border-t-transparent",

  // Effects & Animations
  "fade-in": "animate-in fade-in duration-200",
  "slide-in": "animate-in slide-in-from-bottom duration-300",
  "zoom-in": "animate-in zoom-in-95 duration-200",
  interactive: "transition-all hover:scale-105 active:scale-95",
  "hover-lift": "transition-transform hover:-translate-y-1",
  "focus-ring":
    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
};

const DEFAULT_ANIMATIONS: Record<string, string> = {
  "fade-in": "fadeIn 0.5s ease-out",
  "fade-out": "fadeOut 0.5s ease-out",
  "slide-up": "slideUp 0.3s ease-out",
  "slide-down": "slideDown 0.3s ease-out",
  "slide-left": "slideLeft 0.3s ease-out",
  "slide-right": "slideRight 0.3s ease-out",
  "scale-in": "scaleIn 0.2s ease-out",
  "scale-out": "scaleOut 0.2s ease-out",
  "bounce-in": "bounceIn 0.6s ease-out",
  pulse: "pulse 2s ease-in-out infinite",
  spin: "spin 1s linear infinite",
  ping: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite",
  bounce: "bounce 1s infinite",
};

const DEFAULT_KEYFRAMES: Record<
  string,
  Record<string, Record<string, string>>
> = {
  fadeIn: {
    "0%": { opacity: "0" },
    "100%": { opacity: "1" },
  },
  fadeOut: {
    "0%": { opacity: "1" },
    "100%": { opacity: "0" },
  },
  slideUp: {
    "0%": { transform: "translateY(100%)", opacity: "0" },
    "100%": { transform: "translateY(0)", opacity: "1" },
  },
  slideDown: {
    "0%": { transform: "translateY(-100%)", opacity: "0" },
    "100%": { transform: "translateY(0)", opacity: "1" },
  },
  slideLeft: {
    "0%": { transform: "translateX(100%)", opacity: "0" },
    "100%": { transform: "translateX(0)", opacity: "1" },
  },
  slideRight: {
    "0%": { transform: "translateX(-100%)", opacity: "0" },
    "100%": { transform: "translateX(0)", opacity: "1" },
  },
  scaleIn: {
    "0%": { transform: "scale(0.8)", opacity: "0" },
    "100%": { transform: "scale(1)", opacity: "1" },
  },
  scaleOut: {
    "0%": { transform: "scale(1)", opacity: "1" },
    "100%": { transform: "scale(0.8)", opacity: "0" },
  },
  bounceIn: {
    "0%": { transform: "scale(0.3)", opacity: "0" },
    "50%": { transform: "scale(1.1)", opacity: "1" },
    "100%": { transform: "scale(1)", opacity: "1" },
  },
  pulse: {
    "0%, 100%": { opacity: "1" },
    "50%": { opacity: "0.5" },
  },
  spin: {
    "0%": { transform: "rotate(0deg)" },
    "100%": { transform: "rotate(360deg)" },
  },
  ping: {
    "75%, 100%": { transform: "scale(2)", opacity: "0" },
  },
  bounce: {
    "0%, 100%": {
      transform: "translateY(-25%)",
      animationTimingFunction: "cubic-bezier(0.8, 0, 1, 1)",
    },
    "50%": {
      transform: "translateY(0)",
      animationTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
    },
  },
};

// MODULE STATE (SINGLETON)

/**
 * Global design tokens state - shared across all composable instances
 */
export const designTokensState = reactive<DesignTokensState>({
  colors: { ...DEFAULT_COLORS },
  semanticColors: { ...DEFAULT_SEMANTIC_COLORS },
  typography: { ...DEFAULT_TYPOGRAPHY },
  spacing: { ...DEFAULT_SPACING },
  effects: { ...DEFAULT_EFFECTS },
  breakpoints: { ...DEFAULT_BREAKPOINTS },
  shortcuts: { ...DEFAULT_SHORTCUTS },
  animations: { ...DEFAULT_ANIMATIONS },
  keyframes: { ...DEFAULT_KEYFRAMES },
});

/**
 * Design Tokens composable for managing UnoCSS configuration state
 *
 * @example
 * ```ts
 * const { tokens, updateColors, updateTypography, resetToDefaults } = useDesignTokens();
 *
 * // Update primary color scale
 * updateColors({ primary: { ...newPrimaryScale } });
 * ```
 */
export function useDesignTokens() {
  /**
   * Update color tokens
   */
  function updateColors(colors: Partial<DesignTokensState["colors"]>): void {
    Object.assign(designTokensState.colors, colors);
  }

  /**
   * Update semantic colors
   */
  function updateSemanticColors(semanticColors: Partial<SemanticColors>): void {
    Object.assign(designTokensState.semanticColors, semanticColors);
  }

  /**
   * Update typography configuration
   */
  function updateTypography(typography: Partial<TypographyConfig>): void {
    Object.assign(designTokensState.typography, typography);
  }

  /**
   * Update spacing scale
   */
  function updateSpacing(spacing: Record<string | number, string>): void {
    Object.assign(designTokensState.spacing, spacing);
  }

  /**
   * Update effects (shadows, radius, blur)
   */
  function updateEffects(effects: Partial<EffectsConfig>): void {
    Object.assign(designTokensState.effects, effects);
  }

  /**
   * Update responsive breakpoints
   */
  function updateBreakpoints(breakpoints: Record<string, string>): void {
    Object.assign(designTokensState.breakpoints, breakpoints);
  }

  /**
   * Update shortcuts (component class combinations)
   */
  function updateShortcuts(shortcuts: Record<string, string>): void {
    Object.assign(designTokensState.shortcuts, shortcuts);
  }

  /**
   * Update animations and keyframes
   */
  function updateAnimations(
    animations: Record<string, string>,
    keyframes?: Record<string, Record<string, Record<string, string>>>,
  ): void {
    Object.assign(designTokensState.animations, animations);
    if (keyframes) {
      Object.assign(designTokensState.keyframes, keyframes);
    }
  }

  /**
   * Reset all tokens to defaults
   */
  function resetToDefaults(): void {
    designTokensState.colors = { ...DEFAULT_COLORS };
    designTokensState.semanticColors = { ...DEFAULT_SEMANTIC_COLORS };
    designTokensState.typography = { ...DEFAULT_TYPOGRAPHY };
    designTokensState.spacing = { ...DEFAULT_SPACING };
    designTokensState.effects = { ...DEFAULT_EFFECTS };
    designTokensState.breakpoints = { ...DEFAULT_BREAKPOINTS };
    designTokensState.shortcuts = { ...DEFAULT_SHORTCUTS };
    designTokensState.animations = { ...DEFAULT_ANIMATIONS };
    designTokensState.keyframes = { ...DEFAULT_KEYFRAMES };
  }

  return {
    // State (readonly externally)
    tokens: readonly(designTokensState) as DeepReadonly<DesignTokensState>,

    updateColors,
    updateSemanticColors,
    updateTypography,
    updateSpacing,
    updateEffects,
    updateBreakpoints,
    updateShortcuts,
    updateAnimations,
    resetToDefaults,
  };
}
