import {
  parseAppearanceSettings,
  type ColorScheme,
  type ThemeId,
} from "@/lib/schemas/appearance";

export type PreloaderColorScheme = "light" | "dark";

export interface PreloaderColors {
  background: string;
  barBackground: string;
  barBorder: string;
  fill: string;
  gridLine: string;
  text: string;
}

type PreloaderPaletteWithoutFill = Omit<PreloaderColors, "fill">;

/** Mirrors each theme's --primary token (aria.css / astro.css / cloudflare.css) */
export const THEME_PRIMARY_COLORS: Record<
  ThemeId,
  Record<PreloaderColorScheme, string>
> = {
  aria: {
    light: "oklch(0.66 0.12 216.53)",
    dark: "oklch(0.6 0.118 184.704)",
  },
  astro: {
    light: "#bc52ee",
    dark: "#bc52ee",
  },
  cloudflare: {
    light: "oklch(0.687 0.2074 38.66)",
    dark: "oklch(0.687 0.2074 38.66)",
  },
};

const PRELOADER_PALETTE_WITHOUT_FILL: Record<
  ThemeId,
  Record<PreloaderColorScheme, PreloaderPaletteWithoutFill>
> = {
  aria: {
    light: {
      background: "oklch(1 0 0)",
      barBackground: "oklch(0.94 0 0)",
      barBorder: "oklch(0.87 0 0)",
      gridLine: "oklch(0.87 0 0 / 0.5)",
      text: "oklch(0.42 0 0)",
    },
    dark: {
      background: "oklch(0.22 0.0033 228.8)",
      barBackground: "oklch(0.23 0.007 228.8)",
      barBorder: "oklch(0.40 0.004 228.8)",
      gridLine: "oklch(0.40 0.004 228.8 / 0.5)",
      text: "oklch(0.8 0.004 228.8)",
    },
  },
  astro: {
    light: {
      background: "oklch(0.99 0.0005 195)",
      barBackground: "oklch(0.94 0.004 312)",
      barBorder: "oklch(0.88 0.008 312)",
      gridLine: "oklch(0.88 0.008 312 / 0.5)",
      text: "oklch(0.55 0.01 312)",
    },
    dark: {
      background: "oklch(0.13 0.01 315.38)",
      barBackground: "oklch(0.22 0.001 195)",
      barBorder: "oklch(0.35 0.002 312)",
      gridLine: "oklch(0.35 0.002 312 / 0.5)",
      text: "oklch(0.6 0.0025 312)",
    },
  },
  cloudflare: {
    light: {
      background: "oklch(98.75% 0 0)",
      barBackground: "oklch(98% 0 0)",
      barBorder: "oklch(93.5% 0 0)",
      gridLine: "oklch(93.5% 0 0 / 0.5)",
      text: "oklch(55.6% 0 0)",
    },
    dark: {
      background: "oklch(0.18 0.0016 17.3)",
      barBackground: "oklch(15% 0 0)",
      barBorder: "oklch(26.9% 0 0)",
      gridLine: "oklch(26.9% 0 0 / 0.5)",
      text: "oklch(70.8% 0 0)",
    },
  },
};

function withThemePrimaryFill(
  themeId: ThemeId,
  scheme: PreloaderColorScheme,
  palette: PreloaderPaletteWithoutFill,
): PreloaderColors {
  return {
    ...palette,
    fill: THEME_PRIMARY_COLORS[themeId][scheme],
  };
}

/** Token-aligned colors for SSR flash + Vue preloader (matches globals.css / astro.css) */
export const PRELOADER_COLORS: Record<
  ThemeId,
  Record<PreloaderColorScheme, PreloaderColors>
> = {
  aria: {
    light: withThemePrimaryFill("aria", "light", PRELOADER_PALETTE_WITHOUT_FILL.aria.light),
    dark: withThemePrimaryFill("aria", "dark", PRELOADER_PALETTE_WITHOUT_FILL.aria.dark),
  },
  astro: {
    light: withThemePrimaryFill("astro", "light", PRELOADER_PALETTE_WITHOUT_FILL.astro.light),
    dark: withThemePrimaryFill("astro", "dark", PRELOADER_PALETTE_WITHOUT_FILL.astro.dark),
  },
  cloudflare: {
    light: withThemePrimaryFill(
      "cloudflare",
      "light",
      PRELOADER_PALETTE_WITHOUT_FILL.cloudflare.light,
    ),
    dark: withThemePrimaryFill(
      "cloudflare",
      "dark",
      PRELOADER_PALETTE_WITHOUT_FILL.cloudflare.dark,
    ),
  },
};

export function resolveIsDarkForColorScheme(
  colorScheme: ColorScheme,
  systemDark = false,
): boolean {
  if (colorScheme === "dark") return true;
  if (colorScheme === "light") return false;
  return systemDark;
}

export function resolvePreloaderThemeState(input: {
  themeId?: unknown;
  colorScheme?: unknown;
  systemDark?: boolean;
}): { themeId: ThemeId; isDark: boolean } {
  const appearance = parseAppearanceSettings({
    themeId: input.themeId,
    colorScheme: input.colorScheme,
  });

  return {
    themeId: appearance.themeId,
    isDark: resolveIsDarkForColorScheme(
      appearance.colorScheme,
      input.systemDark ?? false,
    ),
  };
}

export function getPreloaderColors(
  themeId: ThemeId,
  isDark: boolean,
): PreloaderColors {
  const scheme = isDark ? "dark" : "light";
  return withThemePrimaryFill(
    themeId,
    scheme,
    PRELOADER_PALETTE_WITHOUT_FILL[themeId][scheme],
  );
}

const PRELOADER_CSS_VARS = {
  background: "--preloader-bg",
  barBackground: "--preloader-bar-bg",
  barBorder: "--preloader-bar-border",
  fill: "--preloader-fill",
  gridLine: "--preloader-grid-line",
  text: "--preloader-text",
} as const;

export function applyPreloaderThemeColors(
  element: HTMLElement,
  themeId: ThemeId,
  isDark: boolean,
): void {
  const colors = getPreloaderColors(themeId, isDark);

  for (const [key, cssVar] of Object.entries(PRELOADER_CSS_VARS)) {
    element.style.setProperty(
      cssVar,
      colors[key as keyof PreloaderColors],
    );
  }
}

function readLiveThemeIdFromDocument(
  html: HTMLElement,
): ThemeId | undefined {
  const dataTheme = html.dataset.theme;
  if (dataTheme === "cloudflare" || html.classList.contains("theme-cloudflare")) {
    return "cloudflare";
  }
  if (dataTheme === "astro" || html.classList.contains("theme-astro")) {
    return "astro";
  }
  if (dataTheme === "aria" || html.classList.contains("theme-aria")) {
    return "aria";
  }
  return undefined;
}

export function readPreloaderThemeFromDocument(
  doc: Pick<Document, "documentElement"> = document,
): { themeId: ThemeId; isDark: boolean } {
  const html = doc.documentElement;

  const liveThemeId = readLiveThemeIdFromDocument(html);
  let themeId: ThemeId = liveThemeId ?? "aria";

  if (!liveThemeId) {
    const initial = html.dataset.ariaInitialTheme;
    if (initial === "cloudflare" || initial === "astro" || initial === "aria") {
      themeId = initial;
    }
  }

  const isDark = html.classList.contains("dark");

  return { themeId, isDark };
}
