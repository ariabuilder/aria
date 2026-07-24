import { describe, expect, it } from "vitest";

import { createDefaultGlobalStylesConfig } from "../../../lib/styles/universalDesignSystem";
import { resolveDesignColorAssignmentValue } from "../../../admin/features/Design/lib/designSystemColorVariables";
import {
  buildVariableManagerTokenOptions,
  ensureUniqueVariableKey,
  findExistingTokenExposure,
  paletteTokenSourceKey,
  resolveTokenToVariableReference,
  semanticTokenSourceKey,
} from "../../../admin/features/Design/lib/variableManagerTokens";

const samplePaletteShades = {
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
};

describe("variableManagerTokens", () => {
  it("builds searchable palette and semantic token options", () => {
    const options = buildVariableManagerTokenOptions(
      [
        {
          name: "primary",
          label: "Primary",
          shades: {
            25: "#fafafa",
            50: "#f5f5f5",
            100: "#ebebeb",
            200: "#d6d6d6",
            300: "#c2c2c2",
            400: "#adadad",
            500: "#2d49b7",
            600: "#243a92",
            700: "#1b2c6d",
            800: "#121d49",
            900: "#090f24",
            950: "#050811",
            DEFAULT: "#2d49b7",
          },
        },
      ],
      {
        success: "#16a34a",
        warning: "#f59e0b",
        error: "#dc2626",
        info: "#2563eb",
      },
    );

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "tokens.colors.palette.primary",
          label: "Primary",
          suggestedKey: "primary",
        }),
        expect.objectContaining({
          value: "tokens.colors.palette.primary-500",
          label: "Primary 500",
          suggestedKey: "primary-500",
        }),
        expect.objectContaining({
          value: "tokens.colors.semantic.success",
          label: "Success",
          suggestedKey: "success",
        }),
      ]),
    );
  });

  it("builds palette and semantic token source keys", () => {
    expect(paletteTokenSourceKey("primary")).toBe(
      "tokens.colors.palette.primary",
    );
    expect(paletteTokenSourceKey("primary", 500)).toBe(
      "tokens.colors.palette.primary-500",
    );
    expect(semanticTokenSourceKey("success")).toBe(
      "tokens.colors.semantic.success",
    );
    expect(semanticTokenSourceKey("success", 500)).toBe(
      "tokens.colors.semantic.success-500",
    );
  });

  it("resolves design color assignments to exposed variable references", () => {
    const globalStyles = createDefaultGlobalStylesConfig();
    globalStyles.variables.aliases["text-primary"] = {
      label: "Text Primary",
      sourceType: "token",
      sourceKey: "tokens.colors.palette.primary-500",
      fallback: "",
    };

    expect(
      resolveTokenToVariableReference(
        globalStyles.variables,
        "tokens.colors.palette.primary-500",
      ),
    ).toBe("var(--text-primary)");
    expect(
      resolveDesignColorAssignmentValue({
        variables: globalStyles.variables,
        palettes: [
          {
            name: "primary",
            label: "Primary",
            shades: samplePaletteShades,
          },
          {
            name: "accent",
            label: "Accent",
            shades: samplePaletteShades,
          },
        ],
        semanticColors: {
          success: "#16a34a",
          warning: "#f59e0b",
          error: "#dc2626",
          info: "#2563eb",
        },
        tokenSourceKey: "tokens.colors.palette.primary-500",
        paletteName: "primary",
        shade: 500,
        fallbackColor: "#2d49b7",
      }),
    ).toBe("var(--text-primary)");
    expect(
      resolveDesignColorAssignmentValue({
        variables: globalStyles.variables,
        palettes: [
          {
            name: "accent",
            label: "Accent",
            shades: samplePaletteShades,
          },
        ],
        semanticColors: {
          success: "#16a34a",
          warning: "#f59e0b",
          error: "#dc2626",
          info: "#2563eb",
        },
        tokenSourceKey: "tokens.colors.palette.accent-500",
        paletteName: "accent",
        shade: 500,
        fallbackColor: "#f59e0b",
      }),
    ).toBe("var(--accent-500)");
  });

  it("detects duplicate token exposures and generates unique alias keys", () => {
    const globalStyles = createDefaultGlobalStylesConfig();
    globalStyles.variables.custom.primary = {
      label: "Primary",
      value: "#2d49b7",
      category: "color",
      description: "",
    };
    globalStyles.variables.aliases["brand-primary"] = {
      label: "Brand Primary",
      sourceType: "token",
      sourceKey: "tokens.colors.palette.primary",
      fallback: "",
    };
    globalStyles.variables.aliases["primary-2"] = {
      label: "Primary Two",
      sourceType: "custom",
      sourceKey: "primary",
      fallback: "",
    };

    expect(
      findExistingTokenExposure(
        globalStyles.variables,
        "tokens.colors.palette.primary",
      ),
    ).toBe("brand-primary");
    expect(ensureUniqueVariableKey(globalStyles.variables, "primary")).toBe(
      "primary-3",
    );
  });
});
