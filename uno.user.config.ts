import presetTypography from "@unocss/preset-typography";
import { presetWind3 } from "@unocss/preset-wind3";
import transformerVariantGroup from "@unocss/transformer-variant-group";
import {
  parseUserUnoConfigOverrides,
  type UserUnoConfigOverrides,
} from "./aria/lib/styles/userUnoConfig";
import type { ResolvedUserTheme } from "./aria/lib/styles/resolvedUserTheme";
import {
  NON_CONFLICTING_SEMANTIC_UNO_COLORS,
  SYSTEM_BUTTON_SHORTCUTS,
} from "./aria/lib/styles/unoSystemDefaults";

/**
 * User Website UnoCSS Configuration
 *
 * This config is for user-built websites through Aria.
 * It's separate from the builder admin interface config (uno.aria.config.ts).
 *
 * Colors are injected at compile/publish time from the Design System settings
 * via compileUnoCSS.ts — no hardcoded palettes here.
 */

export function createUserUnoConfig(
  overrides?: UserUnoConfigOverrides,
  dark: "media" | "class" | "disabled" = "class",
  resolvedTheme?: ResolvedUserTheme,
) {
  const parsedOverrides = parseUserUnoConfigOverrides(overrides);

  return {
    presets: [
      presetWind3({
        dark: dark === "disabled" ? "media" : dark,
        preflights: {
          reset: true,
          theme: true,
        },
      }),
      presetTypography(),
    ],
    // Published-site compilation scans class tokens; it does not transform
    // authored CSS directives. Keeping only variant groups avoids pulling
    // css-tree's CommonJS JSON loader into the Cloudflare Worker.
    transformers: [transformerVariantGroup()],
    theme: {
      font: {
        sans: resolvedTheme?.fontFamilies.sans ?? ["system-ui", "sans-serif"],
        serif: resolvedTheme?.fontFamilies.serif ?? ["Georgia", "serif"],
        mono: resolvedTheme?.fontFamilies.mono ?? ["monospace"],
      },
      spacing: {
        120: "30rem",
      },
      breakpoint: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
      },
      colors: {
        ...(resolvedTheme?.paletteColors ?? {}),
        ...NON_CONFLICTING_SEMANTIC_UNO_COLORS,
      },
      ...(parsedOverrides.theme ?? {}),
    },
    rules: [
      // Custom aspect ratio utilities
      ["aspect-video", { "aspect-ratio": "16/9" }],
      ["aspect-square", { "aspect-ratio": "1/1" }],
      ["aspect-portrait", { "aspect-ratio": "3/4" }],

      // Named container widths
      ["container-sm", { "max-width": "640px", margin: "0 auto" }],
      ["container-md", { "max-width": "768px", margin: "0 auto" }],
      ["container-lg", { "max-width": "1024px", margin: "0 auto" }],
      ["container-xl", { "max-width": "1280px", margin: "0 auto" }],
    ],
    shortcuts: {
      ...SYSTEM_BUTTON_SHORTCUTS,
      card: "bg-white border border-neutral-200 rounded-lg shadow-sm p-6",
      input:
        "w-full px-3 py-2 border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500",
      "flex-center": "flex items-center justify-center",
      "flex-between": "flex items-center justify-between",
      "grid-auto": "grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4",
      ...(parsedOverrides.shortcuts ?? {}),
    },
    content: {
      filesystem: [
        "./src/**/*.{astro,html,js,jsx,ts,tsx,vue}",
        "./aria/components/**/*.{astro,vue}",
        "./aria/storage/pages/**/*.json",
        "./aria/storage/components/**/*.json",
      ],
      inline: [],
      pipeline: {
        exclude: [
          /aria\/admin/,
          /aria\/api/,
          /aria\/lib/,
          /uno\.aria\.config\.ts/,
        ],
      },
    },
    safelist: parsedOverrides.safelist ?? [],
  };
}

const userConfig = createUserUnoConfig();

export default userConfig;
