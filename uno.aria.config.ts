import presetIcons from "@unocss/preset-icons";
import presetTypography from "@unocss/preset-typography";
import { presetWind3 } from "@unocss/preset-wind3";
import { icons as hugeicons } from "@iconify-json/hugeicons";
import transformerDirectives from "@unocss/transformer-directives";
import transformerVariantGroup from "@unocss/transformer-variant-group";
import { ICON_PICKER_SAFE_CLASSES } from "./aria/admin/components/ui/icon-picker/icon-picker-options";
import { studioIconSafelist } from "./aria/admin/lib/icons";

/**
 * Aria Builder UnoCSS Configuration
 *
 * Full type-safe configuration for the Aria admin interface.
 * Uses Tailwind-compatible utilities via presetWind.
 *
 * @see https://unocss.dev/config/
 * @see https://unocss.dev/integrations/astro
 */

export default {
  // ============================================================================
  // Presets - Tailwind-compatible utilities + Typography + Icons
  // ============================================================================

  presets: [
    presetWind3({
      dark: "class", // Enable .dark class for dark mode
    }),
    presetTypography(),
    presetIcons({
      mode: "mask", // Force mask mode so icons respond to text color
      collections: {
        hugeicons: () => hugeicons,
      },
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
    }),
  ],

  // ============================================================================
  // Theme Extension - Custom colors and breakpoints
  // ============================================================================

  theme: {
    colors: {
      background: "var(--background)",
      foreground: "var(--foreground)",
      card: "var(--card)",
      "card-foreground": "var(--card-foreground)",
      popover: "var(--popover)",
      "popover-foreground": "var(--popover-foreground)",
      primary: "var(--primary)",
      "primary-foreground": "var(--primary-foreground)",
      secondary: "var(--secondary)",
      "secondary-foreground": "var(--secondary-foreground)",
      muted: "var(--muted)",
      "muted-foreground": "var(--muted-foreground)",
      accent: "var(--accent)",
      "accent-foreground": "var(--accent-foreground)",
      destructive: "var(--destructive)",
      border: "var(--border)",
      input: "var(--input)",
      ring: "var(--ring)",
      tooltip: "var(--tooltip)",
      "chart-1": "var(--chart-1)",
      "chart-2": "var(--chart-2)",
      "chart-3": "var(--chart-3)",
      "chart-4": "var(--chart-4)",
      "chart-5": "var(--chart-5)",
      sidebar: "var(--sidebar)",
      "sidebar-foreground": "var(--sidebar-foreground)",
      "sidebar-primary": "var(--sidebar-primary)",
      "sidebar-primary-foreground": "var(--sidebar-primary-foreground)",
      "sidebar-accent": "var(--sidebar-accent)",
      "sidebar-accent-foreground": "var(--sidebar-accent-foreground)",
      "sidebar-border": "var(--sidebar-border)",
      "sidebar-ring": "var(--sidebar-ring)",
      composer: "var(--composer)",
      "composer-dots": "var(--composer-dots)",
    },
    breakpoint: {
      xs: "475px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1400px",
    },
    fontSize: {
      "4xs": ["0.5rem", "0.625rem"], // 8px
      "3xs": ["0.625rem", "0.75rem"], // 10px
      "2xs": ["0.6875rem", "0.875rem"], // 11px
    },
    fontFamily: {
      sans: "var(--font-sans)",
      serif: "var(--font-serif)",
      mono: "var(--font-mono)",
    },
    tracking: {
      widest: "0.2em",
      long: "0.3em",
    },
    borderRadius: {
      sm: "var(--radius-sm)",
      md: "var(--radius-md)",
      lg: "var(--radius-lg)",
      xl: "var(--radius-xl)",
    },
    boxShadow: {
      "2xs": "var(--shadow-2xs)",
      xs: "var(--shadow-xs)",
      sm: "var(--shadow-sm)",
      DEFAULT: "var(--shadow)",
      md: "var(--shadow-md)",
      lg: "var(--shadow-lg)",
      xl: "var(--shadow-xl)",
      "2xl": "var(--shadow-2xl)",
      "3xl": "var(--shadow-3xl)",
      inner: "var(--shadow-inner)",
    },
    insetShadow: {
      "2xs": "var(--inset-shadow-2xs)",
      xs: "var(--inset-shadow-xs)",
      sm: "var(--inset-shadow-sm)",
      md: "var(--inset-shadow-md)",
      lg: "var(--inset-shadow-lg)",
      xl: "var(--inset-shadow-xl)",
      "2xl": "var(--inset-shadow-2xl)",
    },
    insetRing: {
      DEFAULT: "var(--inset-ring)",
      2: "var(--inset-ring-2)",
      4: "var(--inset-ring-4)",
      8: "var(--inset-ring-8)",
    },
  },

  // ============================================================================
  // Custom Rules - Support for CSS variable opacity
  // ============================================================================

  // Route theme-color opacity utilities to the correct CSS property.
  // This keeps CSS variable-backed colors working with slash variants.
  // Examples: bg-primary/30, ring-ring/50, outline-ring/40.
  rules: [
    // Support slash opacity syntax on CSS var theme colors:
    // bg-primary/5, text-primary/80, border-accent/30, ring-ring/50
    [
      /^(bg|text|border|ring|outline)-([a-z0-9-]+)\/(\d{1,3})$/,
      (
        [, type, colorName, opacity]: string[],
        { theme }: { theme?: { colors?: Record<string, unknown> } },
      ) => {
        const colors = theme?.colors;
        const colorValue = colors?.[colorName];
        if (
          !colorValue ||
          typeof colorValue !== "string" ||
          !colorValue.startsWith("var(--")
        )
          return;

        const opacityNumber = Number(opacity);
        if (
          Number.isNaN(opacityNumber) ||
          opacityNumber < 0 ||
          opacityNumber > 100
        ) {
          return;
        }

        const prop =
          type === "bg"
            ? "background-color"
            : type === "text"
              ? "color"
              : type === "border"
                ? "border-color"
                : type === "ring"
                  ? "--un-ring-color"
                  : "outline-color";

        const varName = colorValue.match(/var\((--[\w-]+)\)/)?.[1];
        if (!varName) return;

        return {
          [prop]: `color-mix(in oklch, var(${varName}) ${opacityNumber}%, transparent)`,
        };
      },
    ],
    // Support opacity on oklch colors: bg-primary-80 = 80% opacity
    // Constrained to known theme colors to prevent regex explosion
    [
      /^(bg|text|border|ring|outline)-(background|foreground|primary|secondary|accent|muted|card|popover|destructive|border|input|ring|sidebar|composer|tooltip|chart-[1-5])-(sidebar-[a-z-]+|card-[a-z]+|popover-[a-z]+|primary-[a-z]+|secondary-[a-z]+|accent-[a-z]+|muted-[a-z]+|\d{1,3})$/,
      (
        [, type, colorName, opacityOrVariant]: string[],
        { theme }: { theme?: { colors?: Record<string, unknown> } },
      ) => {
        // If it's a variant like "card-foreground", let UnoCSS handle it normally
        if (isNaN(Number(opacityOrVariant))) return;

        const opacity = opacityOrVariant;
        const colors = theme?.colors;
        const colorValue = colors?.[colorName];
        if (
          !colorValue ||
          typeof colorValue !== "string" ||
          !colorValue.startsWith("var(--")
        )
          return;

        const prop =
          type === "bg"
            ? "background-color"
            : type === "text"
              ? "color"
              : type === "border"
                ? "border-color"
                : type === "ring"
                  ? "--un-ring-color"
                  : "outline-color";

        // Extract the CSS variable name
        const varName = colorValue.match(/var\((--[\w-]+)\)/)?.[1];
        if (!varName) return;

        return {
          [prop]: `color-mix(in oklch, var(${varName}) ${Number(opacity)}%, transparent)`,
        };
      },
    ],
    // Support scale-20 for tooltip animation
    [
      /^scale-(\d{1,3})$/,
      ([, , value]: string[]) => {
        const scaleValue = Number(value) / 100;
        return {
          transform: `scale3d(${scaleValue}, ${scaleValue}, 1)`,
        };
      },
    ],
    // Nav sidebar left border indicator (no layout shift)
    [
      /^nav-border-(active|inactive|hover)$/,
      ([, state]: string[]) => ({
        "box-shadow":
          state === "active"
            ? "inset 2px 0 0 0 var(--primary)"
            : state === "hover"
              ? "inset 2px 0 0 0 var(--primary)"
              : "inset 2px 0 0 0 transparent",
      }),
    ],
    // Tailwind v4 inset shadows: inset-shadow-2xs … 2xl | none
    [
      /^inset-shadow-(2xs|xs|sm|md|lg|xl|2xl)$/,
      ([, size]: string[]) => ({
        "box-shadow": `var(--inset-shadow-${size})`,
      }),
    ],
    ["inset-shadow-none", { "box-shadow": "none" }],
    // Tailwind v4 inset rings: inset-ring | inset-ring-2 | -4 | -8 | -0
    ["inset-ring", { "box-shadow": "var(--inset-ring)" }],
    [
      /^inset-ring-(2|4|8)$/,
      ([, width]: string[]) => ({
        "box-shadow": `var(--inset-ring-${width})`,
      }),
    ],
    ["inset-ring-0", { "box-shadow": "none" }],
    ["inset-ring-none", { "box-shadow": "none" }],
  ],

  // ============================================================================
  // Transformers - @apply and variant groups
  // ============================================================================

  transformers: [
    transformerDirectives(), // Enable @apply, @screen, @variants
    transformerVariantGroup(), // Enable hover:(bg-gray-400 font-medium)
  ],

  // ============================================================================
  // Preflights - CSS Reset (Tailwind-style)
  // ============================================================================

  preflights: [
    {
      getCSS: () => `
        *, ::before, ::after {
          box-sizing: border-box;
          border-width: 0;
          border-style: solid;
          border-color: currentColor;
        }
        html {
          line-height: 1.3;
          -webkit-text-size-adjust: 100%;
          -moz-tab-size: 4;
          tab-size: 4;
        }
        body {
          margin: 0;
          line-height: inherit;
        }
        h1, h2, h3, h4, h5, h6 {
          font-size: inherit;
          font-weight: inherit;
          line-height: 1;
        }
        a {
          color: inherit;
          text-decoration: inherit;
        }
        b, strong {
          font-weight: bolder;
        }
        button, input, optgroup, select, textarea {
          font-family: inherit;
          font-size: 100%;
          font-weight: inherit;
          line-height: inherit;
          color: inherit;
          margin: 0;
          padding: 0;
        }
        button, select {
          text-transform: none;
        }
        button, [type='button'], [type='reset'], [type='submit'] {
          -webkit-appearance: button;
          background-color: transparent;
          background-image: none;
        }
        img, svg, video, canvas, audio, iframe, embed, object {
          display: block;
          vertical-align: middle;
        }
        img, video {
          max-width: 100%;
          height: auto;
        }
      `,
    },
  ],

  // ============================================================================
  // Content - File extraction configuration
  // ============================================================================

  content: {
    // Explicitly scan these file patterns
    filesystem: [
      "aria/admin/**/*.{vue,ts}",
      "src/**/*.{astro,vue,ts}",
      "aria/**/*.{vue,ts}",
    ],
    // Pipeline extraction from build tools (Vite/Astro).
    // Default extensions omit plain .ts/.js — add shadcn CVA index files explicitly.
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|vine.ts|mdx?|astro|elm|php|phtml|marko|html)($|\?)/,
        /aria\/admin\/components\/ui\/.*\.ts$/,
      ],
      exclude: [
        /node_modules/,
        /\.git/,
        /dist/,
        /\.output/,
        /\.(css|postcss|sass|scss|less|stylus|styl)$/,
      ],
    },
  },

  // ============================================================================
  // Safelist - Dynamic classes that can't be detected via static analysis
  // ============================================================================

  safelist: [
    // =========================================================================
    // Theme & typography (applied via JS, not static templates)
    // =========================================================================
    "dark",
    "font-sans",
    "font-serif",
    "font-mono",
    "text-4xs",
    "text-3xs",
    "text-2xs",

    // =========================================================================
    // Layout utilities (dynamic :class bindings)
    // =========================================================================
    "sm:px-6",
    "lg:px-8",
    "group/sidebar-wrapper",
    "group/menu-item",
    "grid-cols-1",
    "grid-cols-2",
    "grid-cols-3",
    "grid-cols-4",
    "sm:grid-cols-2",
    "md:grid-cols-2",
    "md:grid-cols-3",
    "lg:grid-cols-2",
    "lg:grid-cols-3",
    "xl:grid-cols-4",

    // =========================================================================
    // Design tokens (inset shadows & rings)
    // =========================================================================
    "inset-shadow-2xs",
    "inset-shadow-xs",
    "inset-shadow-sm",
    "inset-shadow-md",
    "inset-shadow-lg",
    "inset-shadow-xl",
    "inset-shadow-2xl",
    "inset-shadow-none",
    "inset-ring",
    "inset-ring-2",
    "inset-ring-4",
    "inset-ring-8",
    "inset-ring-0",
    "inset-ring-none",
    "shadow-inner",

    // =========================================================================
    // Icon registry (studioIcons + derived maps — see aria/admin/lib/icons.ts)
    // Navigation, actions, status, content, editor, design, stage, inspector…
    // =========================================================================
    ...studioIconSafelist,
    "i-hugeicons:flash",
    "i-hugeicons:zoom-in-area",
    "i-hugeicons:zoom-out-area",
    "i-hugeicons:arrow-data-transfer-horizontal",
    "i-hugeicons:arrow-data-transfer-vertical",
    "i-hugeicons:join-round",
    "i-hugeicons:arrow-left-01",
    "i-hugeicons:arrow-right-01",
    "i-hugeicons:arrow-up-01",
    "i-hugeicons:arrow-down-01",
    "i-hugeicons:orthogonal-edge",
    "i-hugeicons:minus-sign",
    "i-hugeicons:plus-sign",
    "i-hugeicons:cursor-edit-01",
    "i-hugeicons:undo-03",
    "i-hugeicons:redo-03",
    "i-hugeicons:pathfinder-minus-front",
    "i-hugeicons:centralized",
    "i-hugeicons:link",
    "i-hugeicons:checkmark-square-02",
    "i-hugeicons:pin-01",
    "i-hugeicons:global",
    "i-hugeicons:text-italic",

    // =========================================================================
    // Status chip colors (dynamic badge variants)
    // =========================================================================
    "text-emerald-400",
    "bg-emerald-500/10",
    "border-emerald-500/20",
    "text-amber-400",
    "bg-amber-500/10",
    "border-amber-500/20",
    "text-red-400",
    "bg-red-500/10",
    "border-red-500/20",
    "text-blue-400",
    "bg-blue-500/10",
    "border-blue-500/20",
    "text-purple-400",
    "bg-purple-500/10",
    "border-purple-500/20",

    // =========================================================================
    // Icon picker (selected dynamically at runtime)
    // =========================================================================
    ...ICON_PICKER_SAFE_CLASSES,
  ],
};
