import { describe, expect, it } from "vitest";

import {
  applyDesignSystemColorsToUniversalDesignSystem,
  createDefaultUniversalDesignSystem,
  createDesignSystemColorsFromUniversalDesignSystem,
  createStylesDataSnapshotFromUniversalDesignSystem,
  normalizeStylesDataToUniversalDesignSystem,
  parseStoredUniversalDesignSystem,
  validateUniversalDesignSystem,
} from "../../lib/styles/universalDesignSystem";
import type { StylesData } from "../../lib/types/classes";

describe("universalDesignSystem", () => {
  it("defaults missing document spacing without overwriting explicit values", () => {
    const stored = createDefaultUniversalDesignSystem() as unknown as {
      globalStyles: {
        defaults: {
          body: Record<string, unknown>;
          root: Record<string, unknown>;
        };
      };
    };
    delete stored.globalStyles.defaults.body.margin;
    delete stored.globalStyles.defaults.body.padding;
    delete stored.globalStyles.defaults.root.margin;
    delete stored.globalStyles.defaults.root.padding;

    const migrated = parseStoredUniversalDesignSystem(stored);
    expect(migrated.globalStyles.defaults.body.margin).toBe("0");
    expect(migrated.globalStyles.defaults.body.padding).toBe("0");
    expect(migrated.globalStyles.defaults.root.margin).toBe("0");
    expect(migrated.globalStyles.defaults.root.padding).toBe("0");

    migrated.globalStyles.defaults.body.margin = "";
    migrated.globalStyles.defaults.body.padding = "var(--page-gutter)";
    migrated.globalStyles.defaults.root.margin = "1rem";
    migrated.globalStyles.defaults.root.padding = "";

    const explicit = parseStoredUniversalDesignSystem(migrated);
    expect(explicit.globalStyles.defaults.body.margin).toBe("");
    expect(explicit.globalStyles.defaults.body.padding).toBe(
      "var(--page-gutter)",
    );
    expect(explicit.globalStyles.defaults.root.margin).toBe("1rem");
    expect(explicit.globalStyles.defaults.root.padding).toBe("");
  });

  it("returns a stable empty universal model for null styles data", () => {
    const normalized = normalizeStylesDataToUniversalDesignSystem(null);

    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.authoring.preferredMode).toBe("semantic");
    expect(normalized.breakpoints.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "base",
          minWidth: 1280,
          canvasWidth: 1440,
        }),
        expect.objectContaining({ id: "tablet", minWidth: 768 }),
        expect.objectContaining({ id: "mobile", minWidth: 0 }),
      ]),
    );
    expect(normalized.semanticClasses).toEqual({});
    expect(normalized.globalStyles).toEqual(
      createDefaultUniversalDesignSystem().globalStyles,
    );
    expect(normalized.artifacts.compiledUnoCSS).toBe("");
  });

  it("maps current styles fields into the universal model", () => {
    const stylesData: StylesData = {
      tokens: {
        colors: { primary: "#ef4444" },
        gradients: { hero: "linear-gradient(red, blue)" },
        spacing: { md: "1rem" },
        fonts: { body: "DM Sans" },
        fontSizes: { lg: "1.125rem" },
        fontWeights: { bold: "700" },
        lineHeights: { snug: "1.375" },
        letterSpacing: { wide: "0.025em" },
        borderWidths: { sm: "1px" },
        borderColors: { muted: "#e5e7eb" },
        borderRadius: { lg: "0.5rem" },
        boxShadows: { md: "0 4px 6px rgb(0 0 0 / 0.1)" },
        opacity: { soft: "0.8" },
        zIndex: { modal: 1000 },
        transitions: { fast: "150ms ease" },
        breakpoints: { sm: "640px", desktop: "1280px" },
      },
      customFonts: {
        fonts: {
          inter: {
            id: "inter",
            name: "Inter",
            family: "Inter",
            formats: [{ format: "woff2", url: "/uploads/inter.woff2" }],
            weight: "400",
            style: "normal",
          },
        },
        googleFonts: {
          "google-dm-sans": {
            id: "google-dm-sans",
            family: "DM Sans",
            variants: ["400", "700"],
            googleFontsURL:
              "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap",
          },
        },
      },
      customClasses: {
        "button-primary": {
          id: "button-primary",
          name: "button-primary",
          variants: [
            {
              breakpoint: "base",
              rules: [{ property: "padding", value: "1rem", important: false }],
            },
          ],
          pseudoVariants: [],
          compoundVariants: [],
          usageCount: 2,
          createdAt: "2026-03-25T00:00:00.000Z",
          updatedAt: "2026-03-25T00:00:00.000Z",
        },
      },
      frameworkMode: "custom",
      compiledUnoCSS: ".bg-primary{background:red}",
      customClassesCSS: ".button-primary{padding:1rem}",
      customFontsCSS: "@font-face{}",
      globalCSS: ".global{}",
      globalCSSHash: "abc123",
      unocssClasses: ["bg-primary"],
      lastCompiled: "2026-03-25T00:00:00.000Z",
    };

    const normalized = normalizeStylesDataToUniversalDesignSystem(stylesData);

    expect(normalized.authoring.preferredMode).toBe("semantic");
    expect(normalized.tokens.colors.palette.primary).toBe("#ef4444");
    expect(normalized.tokens.colors.gradients.hero).toBe(
      "linear-gradient(red, blue)",
    );
    expect(normalized.tokens.typography.families.body).toBe("DM Sans");
    expect(normalized.fonts.assignments.body).toBe("DM Sans");
    expect(normalized.fonts.uploaded.inter.family).toBe("Inter");
    expect(normalized.fonts.google["google-dm-sans"].family).toBe("DM Sans");
    expect(normalized.semanticClasses["button-primary"].usageCount).toBe(2);
    expect(normalized.breakpoints.items).toEqual([
      expect.objectContaining({ id: "base", minWidth: 1280, order: 0 }),
      expect.objectContaining({ id: "sm", minWidth: 640 }),
    ]);
    expect(normalized.artifacts.baseCSS).toBe("");
    expect(normalized.artifacts.compiledUnoCSS).toBe(
      ".bg-primary{background:red}",
    );
    expect(normalized.artifacts.globalCSSHash).toBe("abc123");
    expect(normalized.artifacts.utilityCSS).toBe(".bg-primary{background:red}");
    expect(normalized.artifacts.unocssClasses).toEqual(["bg-primary"]);
  });

  it("converts legacy classes into semantic classes and preserves richer customClasses", () => {
    const stylesData: StylesData = {
      customClasses: {
        legacy: {
          id: "legacy",
          name: "legacy",
          variants: [
            {
              breakpoint: "base",
              rules: [
                { property: "font-size", value: "18px", important: false },
                {
                  property: "background-image",
                  value: "linear-gradient(red, blue)",
                  important: false,
                },
                { property: "z-index", value: "10", important: false },
              ],
            },
          ],
          pseudoVariants: [],
          compoundVariants: [],
          usageCount: 0,
          createdAt: "2026-03-25T12:00:00.000Z",
          updatedAt: "2026-03-25T12:00:00.000Z",
        },
        preserved: {
          id: "preserved",
          name: "preserved",
          variants: [
            {
              breakpoint: "base",
              rules: [{ property: "margin", value: "2rem", important: false }],
            },
          ],
          pseudoVariants: [],
          compoundVariants: [],
          usageCount: 1,
          createdAt: "2026-03-25T00:00:00.000Z",
          updatedAt: "2026-03-25T00:00:00.000Z",
        },
      },
      lastCompiled: "2026-03-25T12:00:00.000Z",
    };

    const normalized = normalizeStylesDataToUniversalDesignSystem(stylesData);

    expect(normalized.semanticClasses.preserved.variants[0].rules).toEqual([
      { property: "margin", value: "2rem", important: false },
    ]);
    expect(normalized.semanticClasses.legacy.variants).toEqual([
      {
        breakpoint: "base",
        rules: [
          { property: "font-size", value: "18px", important: false },
          {
            property: "background-image",
            value: "linear-gradient(red, blue)",
            important: false,
          },
          { property: "z-index", value: "10", important: false },
        ],
      },
    ]);
    expect(normalized.semanticClasses.legacy.createdAt).toBe(
      "2026-03-25T12:00:00.000Z",
    );
  });

  it("falls back to legacy tailwind artifact fields when Uno fields are absent", () => {
    const normalized = normalizeStylesDataToUniversalDesignSystem({
      compiledTailwindCSS: ".text-red{color:red}",
      tailwindClasses: ["text-red"],
    });

    expect(normalized.artifacts.compiledUnoCSS).toBe(".text-red{color:red}");
    expect(normalized.artifacts.unocssClasses).toEqual(["text-red"]);
  });

  it("preserves non-legacy universal typography tokens on parse", () => {
    const universalInput = validateUniversalDesignSystem({
      schemaVersion: 2,
      authoring: {
        preferredMode: "hybrid",
        utilityEngine: "unocss",
      },
      tokens: {
        colors: {
          palette: { primary: "#000" },
          semantic: { text: "#111" },
          gradients: {},
        },
        spacing: {},
        typography: {
          families: {},
          sizes: {},
          weights: {},
          lineHeights: {},
          letterSpacing: { base: "0.02em" },
        },
        borders: {
          widths: {},
          colors: {},
          radii: {},
        },
        effects: {
          shadows: {},
          opacity: {},
          transitions: {},
        },
        layering: {
          zIndex: {},
        },
      },
      breakpoints: {
        items: [
          {
            id: "base",
            label: "Desktop",
            icon: "Monitor",
            minWidth: 1280,
            canvasWidth: 1440,
            enabled: true,
            isDefault: true,
            order: 0,
          },
        ],
      },
      fonts: {
        uploaded: {},
        google: {},
        assignments: {},
      },
      globalStyles: createDefaultUniversalDesignSystem().globalStyles,
      semanticClasses: {},
      contextRules: [],
      animations: { keyframes: {} },
      utilities: {
        safelist: ["bg-primary"],
        shortcuts: { btn: "px-4 py-2" },
      },
      artifacts: {
        baseCSS: ":root{--color-primary:#000}",
        baseCSSHash: "base-hash",
        customClassesCSS: "",
        customFontsCSS: "",
        compiledUnoCSS: ".bg-primary{background:#000}",
        globalCSS: ".bg-primary{background:#000}",
        globalCSSHash: "hash123",
        utilityCSS: ".bg-primary{background:#000}",
        utilityCSSHash: "utility-hash",
        unocssClasses: ["bg-primary"],
        lastCompiled: "2026-03-25T00:00:00.000Z",
      },
    });

    const parsed = parseStoredUniversalDesignSystem(universalInput);

    expect(parsed).toEqual(universalInput);
  });

  it("upgrades legacy default letter spacing tokens to the new incremental scale", () => {
    const universalInput = validateUniversalDesignSystem({
      schemaVersion: 2,
      authoring: {
        preferredMode: "hybrid",
        utilityEngine: "unocss",
      },
      tokens: {
        colors: {
          palette: {},
          semantic: {},
          gradients: {},
        },
        spacing: {},
        typography: {
          families: {},
          sizes: {},
          weights: {},
          lineHeights: {},
          letterSpacing: {
            xs: "0em",
            sm: "0em",
            base: "0em",
            lg: "0em",
            xl: "0em",
            "2xl": "-0.01em",
            "3xl": "-0.015em",
            "4xl": "-0.02em",
            "5xl": "-0.025em",
            "6xl": "-0.03em",
            "7xl": "-0.035em",
            "8xl": "-0.04em",
            "9xl": "-0.045em",
          },
        },
        borders: {
          widths: {},
          colors: {},
          radii: {},
        },
        effects: {
          shadows: {},
          opacity: {},
          transitions: {},
        },
        layering: {
          zIndex: {},
        },
      },
      breakpoints: {
        items: [
          {
            id: "base",
            label: "Desktop",
            icon: "Monitor",
            minWidth: 1280,
            canvasWidth: 1440,
            enabled: true,
            isDefault: true,
            order: 0,
          },
        ],
      },
      fonts: {
        uploaded: {},
        google: {},
        assignments: {},
      },
      globalStyles: createDefaultUniversalDesignSystem().globalStyles,
      semanticClasses: {},
      contextRules: [],
      animations: { keyframes: {} },
      utilities: {
        safelist: [],
        shortcuts: {},
      },
      artifacts: {
        baseCSS: "",
        baseCSSHash: "",
        customClassesCSS: "",
        customFontsCSS: "",
        compiledUnoCSS: "",
        globalCSS: "",
        globalCSSHash: "",
        utilityCSS: "",
        utilityCSSHash: "",
        unocssClasses: [],
        lastCompiled: "",
      },
    });

    const parsed = parseStoredUniversalDesignSystem(universalInput);

    expect(parsed.tokens.typography.letterSpacing).toMatchObject({
      xs: "0.01em",
      sm: "0.005em",
      base: "0em",
      lg: "-0.005em",
      xl: "-0.01em",
      "2xl": "-0.015em",
      "9xl": "-0.05em",
    });
  });

  it("creates a legacy-compatible StylesData snapshot from the universal model", () => {
    const universalInput = validateUniversalDesignSystem({
      schemaVersion: 2,
      authoring: {
        preferredMode: "semantic",
        utilityEngine: "unocss",
      },
      tokens: {
        colors: {
          palette: { primary: "#000" },
          semantic: { text: "#111" },
          gradients: { hero: "linear-gradient(red, blue)" },
        },
        spacing: { md: "1rem" },
        typography: {
          families: { body: "DM Sans" },
          sizes: { lg: "1.125rem" },
          weights: { bold: "700" },
          lineHeights: { snug: "1.375" },
          letterSpacing: { wide: "0.025em" },
        },
        borders: {
          widths: { sm: "1px" },
          colors: { muted: "#ddd" },
          radii: { lg: "0.5rem" },
        },
        effects: {
          shadows: { md: "0 4px 6px rgb(0 0 0 / 0.1)" },
          opacity: { soft: "0.8" },
          transitions: { fast: "150ms ease" },
        },
        layering: {
          zIndex: { modal: 1000 },
        },
      },
      breakpoints: {
        items: [
          {
            id: "base",
            label: "Desktop",
            icon: "Monitor",
            minWidth: 1280,
            canvasWidth: 1440,
            enabled: true,
            isDefault: true,
            order: 0,
          },
          {
            id: "mobile",
            label: "Mobile",
            icon: "Monitor",
            minWidth: 0,
            canvasWidth: 375,
            enabled: true,
            isDefault: true,
            order: 2,
          },
        ],
      },
      fonts: {
        uploaded: {},
        google: {
          "google-dm-sans": {
            id: "google-dm-sans",
            family: "DM Sans",
            variants: ["400"],
            googleFontsURL:
              "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400&display=swap",
          },
        },
        assignments: { body: "DM Sans" },
      },
      globalStyles: createDefaultUniversalDesignSystem().globalStyles,
      semanticClasses: {},
      contextRules: [],
      animations: { keyframes: {} },
      utilities: {
        safelist: [],
        shortcuts: {},
      },
      artifacts: {
        baseCSS: ":root{--font-family-body:DM Sans}",
        baseCSSHash: "base-hash",
        customClassesCSS: ".button{}",
        customFontsCSS: "@font-face{}",
        compiledUnoCSS: ".bg-primary{}",
        globalCSS: ".global{}",
        globalCSSHash: "hash123",
        utilityCSS: ".bg-primary{}",
        utilityCSSHash: "utility-hash",
        unocssClasses: ["bg-primary"],
        lastCompiled: "2026-03-25T00:00:00.000Z",
      },
    });

    const snapshot =
      createStylesDataSnapshotFromUniversalDesignSystem(universalInput);

    expect(snapshot.frameworkMode).toBe("custom");
    expect(snapshot.tokens?.colors).toEqual({ primary: "#000" });
    expect(snapshot.tokens?.gradients).toEqual({
      hero: "linear-gradient(red, blue)",
    });
    expect(snapshot.tokens?.breakpoints).toEqual({ mobile: "0px" });
    expect(snapshot.customFonts?.googleFonts["google-dm-sans"].family).toBe(
      "DM Sans",
    );
    expect(snapshot.baseCSS).toBe(":root{--font-family-body:DM Sans}");
    expect(snapshot.compiledUnoCSS).toBe(".bg-primary{}");
    expect(snapshot.globalCSSHash).toBe("hash123");
    expect(snapshot.globalStyles).toEqual(universalInput.globalStyles);
    expect(snapshot.utilityCSSHash).toBe("utility-hash");
  });

  it("maps design-system colors into canonical tokens and back out", () => {
    const updated = applyDesignSystemColorsToUniversalDesignSystem(
      createDefaultUniversalDesignSystem(),
      {
        activeTemplateId: "sage",
        palettes: {
          primary: {
            25: "#f5fffb",
            50: "#ecfdf5",
            100: "#d1fae5",
            200: "#a7f3d0",
            300: "#6ee7b7",
            400: "#34d399",
            500: "#10b981",
            600: "#059669",
            700: "#047857",
            800: "#065f46",
            900: "#064e3b",
            950: "#022c22",
            DEFAULT: "#10b981",
          },
        },
        semantic: {
          success: "#10b981",
          warning: "#f59e0b",
          error: "#ef4444",
          info: "#0ea5e9",
        },
        customPalettes: [
          {
            id: "primary",
            name: "Brand Primary",
            shades: {
              25: "#f5fffb",
              50: "#ecfdf5",
              100: "#d1fae5",
              200: "#a7f3d0",
              300: "#6ee7b7",
              400: "#34d399",
              500: "#10b981",
              600: "#059669",
              700: "#047857",
              800: "#065f46",
              900: "#064e3b",
              950: "#022c22",
              DEFAULT: "#10b981",
            },
            isCustom: true,
          },
        ],
        paletteAliases: {
          "old-primary": "var(--primary)",
          "old-primary-500": "var(--primary-500)",
        },
      },
    );

    expect(updated.tokens.colors.palette.primary).toBe("#10b981");
    expect(updated.tokens.colors.paletteLabels?.primary).toBe("Brand Primary");
    expect(updated.tokens.colors.paletteAliases?.["old-primary"]).toBe(
      "var(--primary)",
    );
    expect(updated.tokens.colors.palette["primary-25"]).toBe("#f5fffb");
    expect(updated.tokens.colors.palette["primary-500"]).toBe("#10b981");
    expect(updated.tokens.colors.semantic.success).toBe("#10b981");

    const extracted =
      createDesignSystemColorsFromUniversalDesignSystem(updated);

    expect(extracted.activeTemplateId).toBe("custom");
    expect(extracted.palettes.primary[25]).toBe("#f5fffb");
    expect(extracted.palettes.primary[500]).toBe("#10b981");
    expect(extracted.palettes.primary.DEFAULT).toBe("#10b981");
    expect(extracted.customPalettes?.[0]?.name).toBe("Brand Primary");
    expect(extracted.paletteAliases?.["old-primary-500"]).toBe(
      "var(--primary-500)",
    );
    expect(extracted.semantic.info).toBe("#0ea5e9");
  });
});
