import { THEME_IDS, type ThemeId } from "@/lib/schemas/appearance";

export interface ThemeDefinition {
  readonly id: ThemeId;
  readonly label: string;
  /** Slightly muted primary color shown in the appearance theme picker. */
  readonly primaryColor: string;
  readonly cssClass?: string;
  readonly dataTheme?: string;
}

export const THEME_REGISTRY = {
  aria: {
    id: "aria",
    label: "Aria",
    primaryColor: "color-mix(in oklch, var(--aria-brand-primary) 82%, black)",
    cssClass: "theme-aria",
    dataTheme: "aria",
  },
  astro: {
    id: "astro",
    label: "Orbital",
    primaryColor: "color-mix(in oklch, var(--astro-purple) 82%, black)",
    cssClass: "theme-astro",
    dataTheme: "astro",
  },
  cloudflare: {
    id: "cloudflare",
    label: "Signal",
    primaryColor: "color-mix(in oklch, var(--cf-brand) 82%, black)",
    cssClass: "theme-cloudflare",
    dataTheme: "cloudflare",
  },
} as const satisfies Record<ThemeId, ThemeDefinition>;

/** Compile-time guard: registry keys === THEME_IDS */

export const THEME_OPTIONS = THEME_IDS.map(
  (id) => THEME_REGISTRY[id],
) satisfies readonly ThemeDefinition[];
