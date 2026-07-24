import { describe, expect, it } from "vitest";

import { createDefaultGlobalStylesConfig } from "../../../lib/styles/universalDesignSystem";
import {
  extractCssVariableReferenceKey,
  resolveColorPickerPreviewValue,
} from "../../../admin/features/Design/lib/colorPickerValue";

describe("colorPickerValue", () => {
  it("extracts CSS variable reference keys", () => {
    expect(extractCssVariableReferenceKey("var(--brand-primary)")).toBe(
      "brand-primary",
    );
    expect(
      extractCssVariableReferenceKey("var(--brand-primary, #2d49b7)"),
    ).toBe("brand-primary");
    expect(extractCssVariableReferenceKey("#2d49b7")).toBeNull();
  });

  it("returns direct color values unchanged", () => {
    const variables = createDefaultGlobalStylesConfig().variables;

    expect(resolveColorPickerPreviewValue("#2d49b7", variables, [])).toBe(
      "#2d49b7",
    );
  });

  it("resolves custom variable references", () => {
    const variables = createDefaultGlobalStylesConfig().variables;
    variables.custom["brand-primary"] = {
      label: "Brand Primary",
      value: "#2d49b7",
      category: "color",
      description: "",
    };

    expect(
      resolveColorPickerPreviewValue("var(--brand-primary)", variables, []),
    ).toBe("#2d49b7");
  });

  it("resolves aliases backed by design tokens", () => {
    const variables = createDefaultGlobalStylesConfig().variables;
    variables.aliases.accent = {
      label: "Accent",
      sourceType: "token",
      sourceKey: "tokens.colors.palette.primary-500",
      fallback: "#111111",
    };

    expect(
      resolveColorPickerPreviewValue("var(--accent)", variables, [
        {
          value: "tokens.colors.palette.primary-500",
          preview: "#2d49b7",
        },
      ]),
    ).toBe("#2d49b7");
  });

  it("resolves design-system palette variables before global style aliases", () => {
    const variables = createDefaultGlobalStylesConfig().variables;
    const palettes = [
      {
        name: "accent",
        label: "Accent",
        shades: {
          25: "#fffbeb",
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          950: "#451a03",
          DEFAULT: "#f59e0b",
        },
      },
    ];
    const semanticColors = {
      success: "#16a34a",
      warning: "#f59e0b",
      error: "#dc2626",
      info: "#2563eb",
    };

    expect(
      resolveColorPickerPreviewValue("var(--accent-300)", variables, [], {
        palettes,
        semanticColors,
      }),
    ).toBe("#fcd34d");
  });

  it("falls back through nested aliases and fallback values", () => {
    const variables = createDefaultGlobalStylesConfig().variables;
    variables.custom["brand-primary"] = {
      label: "Brand Primary",
      value: "#2d49b7",
      category: "color",
      description: "",
    };
    variables.aliases.accent = {
      label: "Accent",
      sourceType: "custom",
      sourceKey: "brand-primary",
      fallback: "#111111",
    };
    variables.aliases.warning = {
      label: "Warning",
      sourceType: "custom",
      sourceKey: "missing-key",
      fallback: "#f59e0b",
    };

    expect(resolveColorPickerPreviewValue("var(--accent)", variables, [])).toBe(
      "#2d49b7",
    );
    expect(
      resolveColorPickerPreviewValue("var(--warning)", variables, []),
    ).toBe("#f59e0b");
  });
});
