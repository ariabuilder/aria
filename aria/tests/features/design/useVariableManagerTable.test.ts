import { computed, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it } from "vitest";

import { useVariableManagerTable } from "../../../admin/features/Design/composables/useVariableManagerTable";
import { buildVariableManagerTokenOptions } from "../../../admin/features/Design/lib/variableManagerTokens";
import { createDefaultGlobalStylesConfig } from "../../../lib/styles/universalDesignSystem";

const STORAGE_KEY = "aria-variable-manager-table-state";

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

function createTableHarness() {
  const globalStyles = ref(createDefaultGlobalStylesConfig());
  globalStyles.value.variables.custom.primary = {
    label: "Primary Value",
    value: "#2d49b7",
    category: "color",
    description: "Primary brand tone",
  };
  globalStyles.value.variables.aliases["brand-primary"] = {
    label: "Brand Primary",
    sourceType: "token",
    sourceKey: "tokens.colors.palette.primary",
    fallback: "#2d49b7",
  };
  globalStyles.value.variables.aliases["content-gap"] = {
    label: "Content Gap",
    sourceType: "custom",
    sourceKey: "primary",
    fallback: "1rem",
  };

  return useVariableManagerTable({
    globalStyles,
    designTokenOptions: computed(() => createTokenOptions()),
    customVariableOptions: computed(() =>
      Object.entries(globalStyles.value.variables.custom).map(
        ([key, variable]) => ({
          value: key,
          label: variable.label.trim() || `--${key}`,
        }),
      ),
    ),
    renameCustomVariableKey: () => {},
    renameAliasKey: () => {},
    duplicateCustomVariable: () => null,
    duplicateAlias: () => null,
    removeCustomVariable: () => {},
    removeAlias: () => {},
  });
}

describe("useVariableManagerTable", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("filters through the hidden search text column", () => {
    const tableState = createTableHarness();

    tableState.searchQuery.value = "brand tone";

    expect(
      tableState.table.getRowModel().rows.map((row) => row.original.key),
    ).toEqual(["primary"]);
  });

  it("keeps a wider key column while letting the value column fill spare space", () => {
    const tableState = createTableHarness();
    const keyColumn = tableState.table.getColumn("key");
    const valueColumn = tableState.table.getColumn("value");

    expect(keyColumn?.getSize()).toBe(300);
    expect(valueColumn?.columnDef.meta).toMatchObject({
      studioTableWidthMode: "flex",
    });
  });

  it("filters by segment through TanStack column filters", () => {
    const tableState = createTableHarness();

    tableState.setActiveSegment("aliases");

    expect(
      tableState.table.getRowModel().rows.map((row) => row.original.key),
    ).toEqual(["brand-primary", "content-gap"]);
  });

  it("sorts rows through TanStack sorting state", () => {
    const tableState = createTableHarness();

    tableState.table.setSorting([{ id: "label", desc: false }]);

    expect(
      tableState.table.getRowModel().rows.map((row) => row.original.key),
    ).toEqual(["brand-primary", "content-gap", "primary"]);
  });

  it("restores persisted query, segment, and sorting state from localStorage", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        query: "brand",
        segment: "aliases",
        sourceFilter: "all",
        sorting: [{ id: "label", desc: true }],
      }),
    );

    const tableState = createTableHarness();

    expect(tableState.searchQuery.value).toBe("brand");
    expect(tableState.activeSegment.value).toBe("aliases");
    expect(tableState.table.getState().sorting).toEqual([
      { id: "label", desc: true },
    ]);
    expect(
      tableState.table.getRowModel().rows.map((row) => row.original.key),
    ).toEqual(["brand-primary"]);
  });

  it("drops invalid persisted state and falls back to defaults", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        query: 42,
        segment: "bad",
        sourceFilter: "bad",
        sorting: [{ id: "nope", desc: "wrong" }],
      }),
    );

    const tableState = createTableHarness();

    expect(tableState.searchQuery.value).toBe("");
    expect(tableState.activeSegment.value).toBe("all");
    expect(tableState.table.getState().sorting).toEqual([]);
  });

  it("persists query, segment, and sorting state to localStorage", async () => {
    const tableState = createTableHarness();

    tableState.searchQuery.value = "primary";
    tableState.setActiveSegment("aliases");
    tableState.table.setSorting([{ id: "value", desc: true }]);

    await nextTick();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      query: "primary",
      segment: "aliases",
      sourceFilter: "all",
      sorting: [{ id: "value", desc: true }],
    });
  });
});
