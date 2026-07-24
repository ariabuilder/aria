import { computed, nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useClassManagerTable } from "../../../admin/features/Design/composables/useClassManagerTable";
import type { ClassManagerRow } from "../../../admin/features/Design/lib/classManagerTable";

const STORAGE_KEY = "aria-class-manager-table-state";

function createRows(): ClassManagerRow[] {
  return [
    {
      id: "defined:hero-heading",
      name: "hero-heading",
      status: "used",
      statusLabel: "Used",
      description: "Hero title styling",
      usageCount: 2,
      pageCount: 1,
      layoutCount: 0,
      componentCount: 1,
      collectionSummary: "1 page • 1 component",
      variantCount: 2,
      pseudoVariantCount: 1,
      compoundVariantCount: 0,
      hasAdvancedCss: false,
      variantBreakpoints: ["base"],
      variantBreakpointsLabel: "base",
      cssSummary: "font-size: 3rem; font-weight: 700",
      createdAt: "2026-04-10T10:00:00.000Z",
      createdAtLabel: "Apr 10, 2026",
      updatedAt: "2026-04-12T12:00:00.000Z",
      updatedAtLabel: "Apr 12, 2026",
      searchText:
        "hero-heading used hero title styling font-size 1 page 1 component 2026-04-10T10:00:00.000Z 2026-04-12T12:00:00.000Z",
      locations: [],
      classDefinition: {
        id: "hero-heading",
        name: "hero-heading",
        description: "Hero title styling",
        variants: [],
        pseudoVariants: [],
        compoundVariants: [],
        usageCount: 0,
        createdAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-12T12:00:00.000Z",
      },
    },
    {
      id: "defined:card-shell",
      name: "card-shell",
      status: "unused",
      statusLabel: "Unused",
      description: "Card shell",
      usageCount: 0,
      pageCount: 0,
      layoutCount: 0,
      componentCount: 0,
      collectionSummary: "No references",
      variantCount: 1,
      pseudoVariantCount: 0,
      compoundVariantCount: 0,
      hasAdvancedCss: false,
      variantBreakpoints: ["base"],
      variantBreakpointsLabel: "base",
      cssSummary: "padding: 1rem",
      createdAt: "2026-04-10T10:00:00.000Z",
      createdAtLabel: "Apr 10, 2026",
      updatedAt: "2026-04-11T10:00:00.000Z",
      updatedAtLabel: "Apr 11, 2026",
      searchText:
        "card-shell unused card shell padding 2026-04-10T10:00:00.000Z 2026-04-11T10:00:00.000Z",
      locations: [],
      classDefinition: {
        id: "card-shell",
        name: "card-shell",
        description: "Card shell",
        variants: [],
        pseudoVariants: [],
        compoundVariants: [],
        usageCount: 0,
        createdAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-11T10:00:00.000Z",
      },
    },
    {
      id: "orphaned:missing-class",
      name: "missing-class",
      status: "orphaned",
      statusLabel: "Orphaned",
      description: "Referenced by content but missing from the class registry.",
      usageCount: 1,
      pageCount: 1,
      layoutCount: 0,
      componentCount: 0,
      collectionSummary: "1 page",
      variantCount: 0,
      pseudoVariantCount: 0,
      compoundVariantCount: 0,
      hasAdvancedCss: false,
      variantBreakpoints: [],
      variantBreakpointsLabel: "",
      cssSummary: "Missing class definition",
      createdAt: "",
      createdAtLabel: "N/A",
      updatedAt: "",
      updatedAtLabel: "Missing definition",
      searchText: "missing-class orphaned missing class definition 1 page",
      locations: [],
      classDefinition: null,
    },
  ];
}

function createTableHarness() {
  return useClassManagerTable({
    rows: computed(() => createRows()),
    onEditCss: vi.fn(),
    onRenameClass: vi.fn(),
    onDuplicateClass: vi.fn(),
    onDeleteClass: vi.fn(),
  });
}

describe("useClassManagerTable", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("filters through the hidden search text column", () => {
    const tableState = createTableHarness();

    tableState.searchQuery.value = "hero title";

    expect(
      tableState.table.getRowModel().rows.map((row) => row.original.name),
    ).toEqual(["hero-heading"]);
  });

  it("filters by segment through TanStack column filters", () => {
    const tableState = createTableHarness();

    tableState.setActiveSegment("orphaned");

    expect(
      tableState.table.getRowModel().rows.map((row) => row.original.name),
    ).toEqual(["missing-class"]);
  });

  it("sorts rows through TanStack sorting state", () => {
    const tableState = createTableHarness();

    tableState.table.setSorting([{ id: "name", desc: false }]);

    expect(
      tableState.table.getRowModel().rows.map((row) => row.original.name),
    ).toEqual(["card-shell", "hero-heading", "missing-class"]);
  });

  it("restores persisted query, segment, and sorting state from localStorage", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        query: "missing",
        segment: "orphaned",
        sorting: [{ id: "name", desc: true }],
      }),
    );

    const tableState = createTableHarness();

    expect(tableState.searchQuery.value).toBe("missing");
    expect(tableState.activeSegment.value).toBe("orphaned");
    expect(tableState.table.getState().sorting).toEqual([
      { id: "name", desc: true },
    ]);
  });

  it("persists query, segment, and sorting state to localStorage", async () => {
    const tableState = createTableHarness();

    tableState.searchQuery.value = "hero";
    tableState.setActiveSegment("used");
    tableState.table.setSorting([{ id: "updatedAt", desc: true }]);

    await nextTick();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      query: "hero",
      segment: "used",
      sorting: [{ id: "updatedAt", desc: true }],
    });
  });
});
