import { describe, expect, it } from "vitest";

import {
  buildDesignSystemColorCssVariables,
  createPaletteVariableReference,
  createSemanticVariableReference,
  resolveDesignColorAssignmentValue,
  resolvePaletteColorFromVariableKey,
} from "../../../admin/features/Design/lib/designSystemColorVariables";
import { createDefaultGlobalStylesConfig } from "../../../lib/styles/universalDesignSystem";
import { createDefaultUniversalDesignSystem } from "../../../lib/styles/universalDesignSystem";

const samplePalette = {
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
} as const;

const sampleSemantic = {
  success: "#16a34a",
  warning: "#f59e0b",
  error: "#dc2626",
  info: "#2563eb",
};

describe("designSystemColorVariables", () => {
  it("creates palette and semantic variable references", () => {
    expect(createPaletteVariableReference("accent")).toBe("var(--accent)");
    expect(createPaletteVariableReference("accent", 300)).toBe(
      "var(--accent-300)",
    );
    expect(createSemanticVariableReference("error")).toBe("var(--destructive)");
    expect(createSemanticVariableReference("success", 500)).toBe(
      "var(--success-500)",
    );
  });

  it("resolves palette colors from design-system variable keys", () => {
    expect(
      resolvePaletteColorFromVariableKey("accent-300", [samplePalette], sampleSemantic),
    ).toBe("#fcd34d");
    expect(
      resolvePaletteColorFromVariableKey("color-accent-300", [samplePalette], sampleSemantic),
    ).toBe("#fcd34d");
    expect(
      resolvePaletteColorFromVariableKey("accent", [samplePalette], sampleSemantic),
    ).toBe("#f59e0b");
  });

  it("prefers variable manager aliases, then palette slug variables", () => {
    const globalStyles = createDefaultGlobalStylesConfig();
    globalStyles.variables.aliases["text-primary"] = {
      label: "Text Primary",
      sourceType: "token",
      sourceKey: "tokens.colors.palette.primary-500",
      fallback: "",
    };

    expect(
      resolveDesignColorAssignmentValue({
        variables: globalStyles.variables,
        palettes: [samplePalette],
        semanticColors: sampleSemantic,
        tokenSourceKey: "tokens.colors.palette.primary-500",
        paletteName: "primary",
        shade: 500,
        fallbackColor: "#2d49b7",
      }),
    ).toBe("var(--text-primary)");

    expect(
      resolveDesignColorAssignmentValue({
        variables: globalStyles.variables,
        palettes: [samplePalette],
        semanticColors: sampleSemantic,
        tokenSourceKey: "tokens.colors.palette.accent-300",
        paletteName: "accent",
        shade: 300,
        fallbackColor: "#fcd34d",
      }),
    ).toBe("var(--accent-300)");
  });

  it("resolves semantic design color assignments to CSS variable references", () => {
    expect(
      resolveDesignColorAssignmentValue({
        variables: createDefaultGlobalStylesConfig().variables,
        palettes: [samplePalette],
        semanticColors: sampleSemantic,
        tokenSourceKey: "tokens.colors.semantic.success",
        semanticKey: "success",
        fallbackColor: "#16a34a",
      }),
    ).toBe("var(--success)");

    expect(
      resolveDesignColorAssignmentValue({
        variables: createDefaultGlobalStylesConfig().variables,
        palettes: [samplePalette],
        semanticColors: sampleSemantic,
        tokenSourceKey: "tokens.colors.semantic.error-500",
        semanticKey: "error",
        shade: 500,
        fallbackColor: "#dc2626",
      }),
    ).toBe("var(--destructive-500)");
  });

  it("emits short-form palette and semantic shade variables", () => {
    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.tokens.colors.palette.accent = "#f59e0b";
    designSystem.tokens.colors.palette["accent-300"] = "#fcd34d";
    designSystem.tokens.colors.paletteAliases = {
      "old-accent": "var(--accent)",
      "old-accent-300": "var(--accent-300)",
      accent: "#000000",
    };
    designSystem.tokens.colors.semantic.success = "#16a34a";

    const variables = buildDesignSystemColorCssVariables(designSystem);

    expect(variables["--accent"]).toBe("#f59e0b");
    expect(variables["--accent-300"]).toBe("#fcd34d");
    expect(variables["--old-accent"]).toBe("var(--accent)");
    expect(variables["--old-accent-300"]).toBe("var(--accent-300)");
    expect(variables["--accent"]).not.toBe("#000000");
    expect(variables["--success"]).toBe("#16a34a");
    expect(variables["--success-500"]).toBeTruthy();
    expect(variables["--destructive"]).toBeTruthy();
  });
});
