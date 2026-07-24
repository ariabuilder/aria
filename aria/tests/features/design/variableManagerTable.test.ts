import { describe, expect, it } from "vitest";

import { createDefaultGlobalStylesConfig } from "../../../lib/styles/universalDesignSystem";
import {
  buildVariableManagerRows,
  filterVariableManagerRows,
  parseVariableManagerTableState,
} from "../../../admin/features/Design/lib/variableManagerTable";
import { buildVariableManagerTokenOptions } from "../../../admin/features/Design/lib/variableManagerTokens";

function createTokenOptions() {
  return buildVariableManagerTokenOptions(
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
}

describe("variableManagerTable", () => {
  it("builds custom and alias rows with token metadata", () => {
    const globalStyles = createDefaultGlobalStylesConfig();
    globalStyles.variables.custom.primary = {
      label: "Primary Value",
      value: "#2d49b7",
      category: "color",
      description: "Primary brand tone",
    };
    globalStyles.variables.aliases["brand-primary"] = {
      label: "Brand Primary",
      sourceType: "token",
      sourceKey: "tokens.colors.palette.primary",
      fallback: "#2d49b7",
    };

    const rows = buildVariableManagerRows(
      globalStyles.variables,
      createTokenOptions(),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "custom", key: "primary" });
    expect(rows[1]).toMatchObject({
      kind: "alias",
      key: "brand-primary",
      tokenOption: expect.objectContaining({ label: "Primary" }),
    });
  });

  it("filters rows by search, segment, and alias source type", () => {
    const globalStyles = createDefaultGlobalStylesConfig();
    globalStyles.variables.custom.primary = {
      label: "Primary Value",
      value: "#2d49b7",
      category: "color",
      description: "Primary brand tone",
    };
    globalStyles.variables.aliases["brand-primary"] = {
      label: "Brand Primary",
      sourceType: "token",
      sourceKey: "tokens.colors.palette.primary",
      fallback: "#2d49b7",
    };
    globalStyles.variables.aliases["content-gap"] = {
      label: "Content Gap",
      sourceType: "custom",
      sourceKey: "primary",
      fallback: "1rem",
    };

    const rows = buildVariableManagerRows(
      globalStyles.variables,
      createTokenOptions(),
    );

    expect(
      filterVariableManagerRows(rows, {
        query: "brand-primary",
        segment: "all",
        sourceFilter: "all",
      }).map((row) => row.key),
    ).toEqual(["brand-primary"]);

    expect(
      filterVariableManagerRows(rows, {
        query: "",
        segment: "custom",
        sourceFilter: "all",
      }).map((row) => row.key),
    ).toEqual(["primary"]);

    expect(
      filterVariableManagerRows(rows, {
        query: "",
        segment: "all",
        sourceFilter: "token",
      }).map((row) => row.key),
    ).toEqual(["brand-primary"]);
  });

  it("flags exposure conflicts when multiple aliases expose the same token", () => {
    const globalStyles = createDefaultGlobalStylesConfig();
    globalStyles.variables.aliases["brand-primary"] = {
      label: "Brand Primary",
      sourceType: "token",
      sourceKey: "tokens.colors.palette.primary",
      fallback: "#2d49b7",
    };
    globalStyles.variables.aliases["brand-primary-duplicate"] = {
      label: "Brand Primary Duplicate",
      sourceType: "token",
      sourceKey: "tokens.colors.palette.primary",
      fallback: "#2d49b7",
    };
    globalStyles.variables.aliases["unrelated"] = {
      label: "Unrelated",
      sourceType: "token",
      sourceKey: "tokens.colors.palette.primary-500",
      fallback: "#2d49b7",
    };

    const rows = buildVariableManagerRows(
      globalStyles.variables,
      createTokenOptions(),
    );

    const brandPrimary = rows.find((row) => row.key === "brand-primary");
    const duplicate = rows.find(
      (row) => row.key === "brand-primary-duplicate",
    );
    const unrelated = rows.find((row) => row.key === "unrelated");

    expect(brandPrimary?.kind).toBe("alias");
    expect(duplicate?.kind).toBe("alias");
    if (brandPrimary?.kind === "alias" && duplicate?.kind === "alias") {
      expect(brandPrimary.exposureConflict).toBe("brand-primary-duplicate");
      expect(duplicate.exposureConflict).toBe("brand-primary");
    }
    if (unrelated?.kind === "alias") {
      expect(unrelated.exposureConflict).toBeNull();
    }
  });

  it("handles large variable sets without excessive cost", () => {
    const globalStyles = createDefaultGlobalStylesConfig();

    for (let i = 0; i < 300; i += 1) {
      globalStyles.variables.custom[`custom-${i}`] = {
        label: `Custom ${i}`,
        value: `${i}px`,
        category: "spacing",
      };
    }

    for (let i = 0; i < 150; i += 1) {
      globalStyles.variables.aliases[`alias-${i}`] = {
        label: `Alias ${i}`,
        sourceType: "token",
        sourceKey: "tokens.colors.palette.primary",
        fallback: "#2d49b7",
      };
    }

    const start = performance.now();
    const rows = buildVariableManagerRows(
      globalStyles.variables,
      createTokenOptions(),
    );
    const elapsed = performance.now() - start;

    expect(rows).toHaveLength(450);
    expect(elapsed).toBeLessThan(200);
  });

  it("parses table state through the zod boundary", () => {
    expect(
      parseVariableManagerTableState({
        query: "brand",
        segment: "aliases",
        sourceFilter: "token",
        sorting: [{ id: "label", desc: true }],
      }),
    ).toEqual({
      query: "brand",
      segment: "aliases",
      sourceFilter: "token",
      sorting: [{ id: "label", desc: true }],
    });

    expect(
      parseVariableManagerTableState({
        query: 42,
        segment: "nope",
        sourceFilter: "bad",
        sorting: [{ id: "unknown", desc: "wrong" }],
      }),
    ).toEqual({
      query: "",
      segment: "all",
      sourceFilter: "all",
      sorting: [],
    });
  });
});
