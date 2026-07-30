import { describe, expect, it } from "vitest";

import {
  createDesignSystemSegmentId,
  parseStoredDesignSystemSegments,
  parseStoredDesignSystemRows,
  serializeStoredDesignSystemRows,
} from "../../../lib/storage/designSystemRows";
import {
  createDefaultGlobalStylesConfig,
  createDefaultUniversalDesignSystem,
  normalizeStylesDataToUniversalDesignSystem,
} from "../../../lib/styles/universalDesignSystem";
import type { StylesData } from "../../../lib/types/classes";
import { buildStarterDesignSystem } from "../../../lib/storage/starterContent";

const sampleStyles: StylesData = {
  tokens: {
    colors: { primary: "#f97316", foreground: "#111827" },
    gradients: { hero: "linear-gradient(180deg, #f97316 0%, #ea580c 100%)" },
    spacing: { sm: "0.5rem", md: "1rem" },
    fonts: { body: "Instrument Sans", heading: "Fraunces" },
    fontSizes: { sm: "0.875rem", base: "1rem" },
    fontWeights: { regular: "400", medium: "500" },
    lineHeights: { normal: "1.5" },
    letterSpacing: { normal: "0" },
    borderWidths: { thin: "1px" },
    borderColors: { default: "#e5e7eb" },
    borderRadius: { md: "0.5rem" },
    boxShadows: { soft: "0 8px 30px rgba(0, 0, 0, 0.08)" },
    opacity: { muted: "0.7" },
    zIndex: { modal: 50 },
    transitions: { default: "all 150ms ease" },
    breakpoints: { md: "768px" },
  },
  globalCSS: ".hero-card{padding:1rem;}",
  globalCSSHash: "abc123",
  lastCompiled: "2026-03-16T12:00:00.000Z",
};

describe("designSystemRows segment parsing", () => {
  it("serializes document spacing defaults into starter seed rows", () => {
    const rows = serializeStoredDesignSystemRows(
      buildStarterDesignSystem(),
      "2026-07-29T00:00:00.000Z",
    ).map((row) => ({
      id: row.id,
      stylesJson: row.stylesJson,
    }));

    const parsed = parseStoredDesignSystemRows(rows);
    expect(parsed?.globalStyles.defaults.root).toMatchObject({
      margin: "0",
      padding: "0",
    });
    expect(parsed?.globalStyles.defaults.body).toMatchObject({
      margin: "0",
      padding: "0",
    });
  });

  it("creates stable segment row ids", () => {
    expect(createDesignSystemSegmentId("global-styles")).toBe(
      "default:global-styles",
    );
    expect(createDesignSystemSegmentId("tokens-colors")).toBe(
      "default:tokens-colors",
    );
  });

  it("parses only requested segments and leaves the rest at defaults", () => {
    const designSystem = normalizeStylesDataToUniversalDesignSystem(
      sampleStyles,
    );
    designSystem.globalStyles = createDefaultGlobalStylesConfig();
    designSystem.globalStyles.variables.custom.brand = {
      label: "Brand",
      value: "#123456",
      category: "color",
    };

    const rows = serializeStoredDesignSystemRows(
      designSystem,
      "2026-03-16T12:00:00.000Z",
    ).map((row) => ({
      id: row.id,
      stylesJson: row.stylesJson,
    }));

    const partial = parseStoredDesignSystemSegments(rows, [
      "global-styles",
      "tokens-colors",
    ]);

    expect(partial).not.toBeNull();
    expect(partial!.globalStyles.variables.custom.brand?.value).toBe("#123456");
    expect(partial!.tokens.colors.palette).toEqual(
      designSystem.tokens.colors.palette,
    );
    expect(partial!.artifacts.compiledUnoCSS).toBe("");
    expect(partial!.artifacts.globalCSS).toBe("");
  });

  it("matches full parse for the same segment subset", () => {
    const designSystem = normalizeStylesDataToUniversalDesignSystem(
      sampleStyles,
    );
    const rows = serializeStoredDesignSystemRows(
      designSystem,
      "2026-03-16T12:00:00.000Z",
    ).map((row) => ({
      id: row.id,
      stylesJson: row.stylesJson,
    }));

    const full = parseStoredDesignSystemRows(rows);
    const partial = parseStoredDesignSystemSegments(rows, [
      "global-styles",
      "tokens-colors",
    ]);

    expect(partial!.globalStyles).toEqual(full!.globalStyles);
    expect(partial!.tokens.colors).toEqual(full!.tokens.colors);
  });

  it("falls back to legacy row when segmented rows are absent", () => {
    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.globalStyles.variables.custom.legacy = {
      label: "Legacy",
      value: "1rem",
      category: "spacing",
    };

    const partial = parseStoredDesignSystemSegments(
      [
        {
          id: "default",
          stylesJson: JSON.stringify(designSystem),
        },
      ],
      ["global-styles"],
    );

    expect(partial?.globalStyles.variables.custom.legacy?.value).toBe("1rem");
  });
});
