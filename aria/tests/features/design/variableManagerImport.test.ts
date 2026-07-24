import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createDefaultGlobalStylesConfig } from "../../../lib/styles/universalDesignSystem";
import {
  mergeImportedVariableSet,
  parseVariableImportInput,
  parseVariableImportJson,
} from "../../../admin/features/Design/lib/variableManagerImport";

describe("variableManagerImport", () => {
  it("parses pasted CSS variables into custom variables and aliases", () => {
    const result = parseVariableImportInput(`
      :root {
        --brand-primary: #2d49b7;
        --brand-accent: var(--brand-primary, #1b2c6d);
      }
    `);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.summary).toEqual({
      customCount: 1,
      aliasCount: 1,
      totalCount: 2,
    });
    expect(result.data.custom["brand-primary"]).toMatchObject({
      value: "#2d49b7",
      category: "color",
    });
    expect(result.data.aliases["brand-accent"]).toMatchObject({
      sourceType: "custom",
      sourceKey: "brand-primary",
      fallback: "#1b2c6d",
    });
  });

  it("parses direct JSON variable payloads", () => {
    const result = parseVariableImportJson(
      JSON.stringify({
        custom: {
          "brand-primary": {
            label: "Brand Primary",
            value: "#2d49b7",
            category: "color",
          },
        },
        aliases: {
          "brand-accent": {
            label: "Brand Accent",
            sourceType: "custom",
            sourceKey: "brand-primary",
            fallback: "",
          },
        },
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.summary).toEqual({
      customCount: 1,
      aliasCount: 1,
      totalCount: 2,
    });
  });

  it("parses wrapped framework JSON exports", () => {
    const frameworkPath = resolve(
      process.cwd(),
      "aria/tests/fixtures/aria-framework-export.json",
    );
    const result = parseVariableImportJson(readFileSync(frameworkPath, "utf8"));

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.summary.totalCount).toBe(219);
    expect(result.data.aliases["aria-color-primary"]).toMatchObject({
      sourceType: "token",
      sourceKey: "tokens.colors.palette.primary",
    });
  });

  it("parses full design system exports with globalStyles.variables", () => {
    const designSystemPath = resolve(
      process.cwd(),
      "aria/tests/fixtures/aria-design-system-export.json",
    );
    const result = parseVariableImportJson(
      readFileSync(designSystemPath, "utf8"),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.summary.totalCount).toBe(219);
    expect(result.data.custom["aria-text-fluid-m"]).toMatchObject({
      category: "typography",
    });
  });

  it("preserves token source keys when merging imported aliases", () => {
    const baseVariables = createDefaultGlobalStylesConfig().variables;

    const merged = mergeImportedVariableSet(baseVariables, {
      custom: {},
      aliases: {
        "aria-color-primary": {
          label: "Primary",
          sourceType: "token",
          sourceKey: "tokens.colors.palette.primary",
          fallback: "",
        },
      },
    });

    expect(merged.aliases["aria-color-primary"]).toMatchObject({
      sourceType: "token",
      sourceKey: "tokens.colors.palette.primary",
    });
  });

  it("merges imported variables and resolves key collisions", () => {
    const baseVariables = createDefaultGlobalStylesConfig().variables;
    baseVariables.custom.primary = {
      label: "Primary",
      value: "#2d49b7",
      category: "color",
      description: "",
    };

    const merged = mergeImportedVariableSet(baseVariables, {
      custom: {
        primary: {
          label: "Primary Imported",
          value: "#1b2c6d",
          category: "color",
          description: "",
        },
      },
      aliases: {
        accent: {
          label: "Accent",
          sourceType: "custom",
          sourceKey: "primary",
          fallback: "",
        },
      },
    });

    expect(merged.custom).toEqual(
      expect.objectContaining({
        primary: expect.objectContaining({ value: "#2d49b7" }),
        "primary-2": expect.objectContaining({ value: "#1b2c6d" }),
      }),
    );
    expect(merged.aliases.accent).toMatchObject({
      sourceType: "custom",
      sourceKey: "primary-2",
    });
  });

  it("drops incomplete draft aliases and backfills empty labels before import merge", () => {
    const baseVariables = createDefaultGlobalStylesConfig().variables;
    baseVariables.custom["custom-var-2"] = {
      label: "",
      value: "",
      category: "other",
      description: "",
    };
    baseVariables.aliases["alias-var-1"] = {
      label: "",
      sourceType: "custom",
      sourceKey: "",
      fallback: "",
    };

    const merged = mergeImportedVariableSet(baseVariables, {
      custom: {
        "brand-primary": {
          label: "Brand Primary",
          value: "#2d49b7",
          category: "color",
          description: "",
        },
      },
      aliases: {},
    });

    expect(merged.custom["custom-var-2"]).toMatchObject({
      label: "Custom Var 2",
    });
    expect(merged.aliases["alias-var-1"]).toBeUndefined();
    expect(merged.custom["brand-primary"]).toMatchObject({
      value: "#2d49b7",
    });
  });
});
