import { mergeDeep } from "../utils/objects";
import { log } from "../utils/logger";
import {
  NON_CONFLICTING_SEMANTIC_UNO_COLORS,
  SYSTEM_BUTTON_SHORTCUTS,
} from "./unoSystemDefaults";

/**
 * User UnoCSS Configuration Service
 *
 * UnoCSS config for published user sites.
 * Merges base config with user customizations from site settings.
 */

interface UserUnoThemeConfig {
  colors?: Record<string, unknown>;
  fontFamily?: Record<string, string[]>;
  fontSize?: Record<string, string>;
  breakpoints?: Record<string, string>;
  spacing?: Record<string, string>;
  borderRadius?: Record<string, string>;
}

interface UserUnoOverrideConfig {
  theme?: UserUnoThemeConfig;
  shortcuts?: Record<string, string>;
  rules?: Array<[string, Record<string, unknown>]>;
  safelist?: string[];
}

interface SiteSettingsLike {
  utilityEngine?: string;
  framework?: string;
  unocssConfig?: UserUnoOverrideConfig;
  customFrameworkURL?: string;
}

interface UserUnoRuntimeConfig {
  presets: string[];
  transformers: string[];
  theme: {
    colors: Record<string, unknown>;
    fontFamily: Record<string, string[]>;
    fontSize?: Record<string, string>;
    breakpoints: Record<string, string>;
  };
  shortcuts: Record<string, string>;
  content: {
    filesystem: string[];
    pipeline: {
      exclude: RegExp[];
    };
  };
  safelist: string[];
  rules?: Array<[string, Record<string, unknown>]>;
}

interface UnoGeneratorLike {
  generate: (content: string) => Promise<{ css: string }>;
}

interface UnoModuleLike {
  createGenerator: (config: UserUnoRuntimeConfig) => Promise<UnoGeneratorLike>;
}

function isUnoModuleLike(value: unknown): value is UnoModuleLike {
  if (!value || typeof value !== "object") return false;
  const maybeModule = value as Record<string, unknown>;
  return typeof maybeModule.createGenerator === "function";
}

interface UserUnoConfigOptions {
  siteSettings?: SiteSettingsLike;
  contentPaths?: string[];
  isDev?: boolean;
}

/**
 * Generate dynamic UnoCSS configuration for user websites
 * based on their site settings and customizations
 */
export function generateUserUnoConfig(
  options: UserUnoConfigOptions = {},
): UserUnoRuntimeConfig {
  const { siteSettings, contentPaths = [] } = options;

  // Base configuration (always included)
  const baseConfig: UserUnoRuntimeConfig = {
    presets: ["@unocss/preset-uno", "@unocss/preset-typography"],
    transformers: [
      "@unocss/transformer-directives",
      "@unocss/transformer-variant-group",
    ],
    theme: {
      colors: {
        primary: {
          25: "#f8fcff",
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
          950: "#082f49",
        },
        neutral: {
          25: "#fcfcfc",
          50: "#fafafa",
          100: "#f5f5f5",
          200: "#e5e5e5",
          300: "#d4d4d4",
          400: "#a3a3a3",
          500: "#737373",
          600: "#525252",
          700: "#404040",
          800: "#262626",
          900: "#171717",
          950: "#0a0a0a",
        },
        ...NON_CONFLICTING_SEMANTIC_UNO_COLORS,
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        serif: ["Georgia", "serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
      fontSize: {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
        "3xl": "1.875rem",
        "4xl": "2.25rem",
        "5xl": "3rem",
        "6xl": "3.75rem",
        "7xl": "4.5rem",
        "8xl": "6rem",
        "9xl": "8rem",
      },
      breakpoints: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
      },
    },
    shortcuts: {
      ...SYSTEM_BUTTON_SHORTCUTS,
      card: "bg-white border border-neutral-200 rounded-lg shadow-sm p-6",
      input:
        "w-full px-3 py-2 border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500",
      "flex-center": "flex items-center justify-center",
      "flex-between": "flex items-center justify-between",
      "grid-auto": "grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4",
    },
    content: {
      filesystem: [
        "./src/**/*.{astro,html,js,jsx,ts,tsx,vue}",
        "./aria/components/**/*.{astro,vue}",
        ...contentPaths,
      ],
      pipeline: {
        exclude: [
          /aria\/admin/,
          /aria\/api/,
          /aria\/lib/,
          /uno\.aria\.config\.ts/,
        ],
      },
    },
    safelist: generateBaseSafelist(),
  };

  // Merge user customizations if available
  if (siteSettings?.unocssConfig) {
    const baseSafelist = baseConfig.safelist;

    return mergeDeep(baseConfig, {
      theme: siteSettings.unocssConfig.theme || {},
      shortcuts: siteSettings.unocssConfig.shortcuts || {},
      rules: siteSettings.unocssConfig.rules || [],
      safelist: [
        ...baseSafelist,
        ...(siteSettings.unocssConfig.safelist || []),
      ],
    });
  }

  return baseConfig;
}

/**
 * Generate safelist for common utility classes
 * used for site styles
 */
function generateBaseSafelist(): string[] {
  const safelist: string[] = [];

  // Spacing utilities (padding, margin)
  for (let i = 0; i <= 32; i++) {
    safelist.push(
      `p-${i}`,
      `m-${i}`,
      `px-${i}`,
      `py-${i}`,
      `mx-${i}`,
      `my-${i}`,
    );
    safelist.push(`pt-${i}`, `pb-${i}`, `pl-${i}`, `pr-${i}`);
    safelist.push(`mt-${i}`, `mb-${i}`, `ml-${i}`, `mr-${i}`);
  }

  safelist.push(
    ...[
      "block",
      "inline-block",
      "inline",
      "flex",
      "grid",
      "hidden",
      "relative",
      "absolute",
      "fixed",
      "sticky",
      "w-full",
      "w-auto",
      "h-full",
      "h-auto",
      "min-h-screen",
      "justify-center",
      "justify-start",
      "justify-end",
      "justify-between",
      "items-center",
      "items-start",
      "items-end",
      "items-stretch",
      "flex-col",
      "flex-row",
      "flex-wrap",
      "gap-1",
      "gap-2",
      "gap-4",
      "gap-8",
    ],
  );

  safelist.push(
    ...[
      "text-xs",
      "text-sm",
      "text-base",
      "text-lg",
      "text-xl",
      "text-2xl",
      "font-normal",
      "font-medium",
      "font-semibold",
      "font-bold",
      "text-left",
      "text-center",
      "text-right",
      "text-justify",
      "leading-tight",
      "leading-normal",
      "leading-loose",
    ],
  );

  const colorShades = [
    "25",
    "50",
    "100",
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
    "900",
    "950",
  ];
  ["primary", "neutral"].forEach((color) => {
    colorShades.forEach((shade) => {
      safelist.push(
        `text-${color}-${shade}`,
        `bg-${color}-${shade}`,
        `border-${color}-${shade}`,
      );
    });
  });

  safelist.push(
    ...[
      "border",
      "border-0",
      "border-t",
      "border-b",
      "border-l",
      "border-r",
      "rounded",
      "rounded-lg",
      "rounded-xl",
      "rounded-full",
      "rounded-none",
    ],
  );

  safelist.push(
    ...[
      "shadow",
      "shadow-lg",
      "shadow-xl",
      "shadow-none",
      "opacity-0",
      "opacity-50",
      "opacity-100",
      "transition",
      "duration-300",
      "ease-in-out",
    ],
  );

  return safelist;
}

/**
 * Generate CSS for user websites using UnoCSS
 * This is called during the rendering pipeline
 */
export async function generateUserCSS(
  content: string,
  siteSettings?: SiteSettingsLike,
): Promise<string> {
  // Only proceed if UnoCSS is enabled for this site
  const utilityEngine =
    siteSettings?.utilityEngine ?? siteSettings?.framework ?? "unocss";

  if (utilityEngine !== "unocss") {
    return "";
  }

  try {
    // Dynamic import to avoid build-time dependency issues
    const unoModule: unknown = await import("unocss");
    if (!isUnoModuleLike(unoModule)) {
      throw new Error("Invalid UnoCSS module shape");
    }

    const config = generateUserUnoConfig({ siteSettings });
    const generator = await unoModule.createGenerator(config);

    const { css } = await generator.generate(content);

    return css;
  } catch (error) {
    log("error", "Error generating user UnoCSS", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

/**
 * Get UnoCSS CDN link for user websites
 * when using default configuration
 */
export function getUnoCSSTags(siteSettings?: {
  utilityEngine?: string;
  framework?: string;
  unocssConfig?: UserUnoOverrideConfig;
  customFrameworkURL?: string;
}): string {
  const utilityEngine =
    siteSettings?.utilityEngine ?? siteSettings?.framework ?? "unocss";

  if (utilityEngine !== "unocss") {
    return "";
  }

  const runtimeConfig = generateUserUnoConfig({ siteSettings });

  // Use uno.global.js which includes preset-wind with all utility rules
  return `
    <script src="https://cdn.jsdelivr.net/npm/@unocss/runtime/uno.global.js"></script>
    <script>
      window.__unocss_runtime = {
        rules: ${JSON.stringify(runtimeConfig.rules || [])},
        shortcuts: ${JSON.stringify(runtimeConfig.shortcuts)},
        theme: ${JSON.stringify(runtimeConfig.theme)},
      };
    </script>
  `;
}
