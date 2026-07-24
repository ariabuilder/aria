import { ref } from "vue";
import { describe, expect, it } from "vitest";
import type { Page } from "@/composables/useBuilderData";
import { usePagesTable } from "../../../../admin/features/Studio/pages/composables/usePagesTable";
import type { PageTreeNode } from "../../../../admin/features/Studio/pages/composables/usePagesListState";

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: "about",
    title: "About",
    slug: "about",
    status: "draft",
    isModifiedSincePublish: false,
    layout: "",
    systemRole: "standard",
    accessMode: "public",
    hasPassword: false,
    updatedAt: null,
    scheduledFor: null,
    ...overrides,
  };
}

function makeNode(page: Page): PageTreeNode {
  return {
    page,
    depth: 0,
    hasChildren: false,
    path: `/${page.slug}`,
  };
}

describe("usePagesTable", () => {
  it("includes a description column in leaf columns", () => {
    const data = ref<PageTreeNode[]>([makeNode(makePage())]);
    const layoutMap = ref(new Map<string, string>());

    const { table } = usePagesTable({ data, layoutMap });
    const columnIds = table
      .getAllLeafColumns()
      .map((column) => column.id);

    expect(columnIds).toContain("description");
  });

  it("renders description text and em dash when empty", () => {
    const data = ref<PageTreeNode[]>([
      makeNode(makePage({ description: "Editor summary" })),
      makeNode(makePage({ id: "contact", slug: "contact" })),
    ]);
    const layoutMap = ref(new Map<string, string>());

    const { table } = usePagesTable({ data, layoutMap });
    const descriptionColumn = table
      .getAllLeafColumns()
      .find((column) => column.id === "description");

    expect(descriptionColumn).toBeDefined();

    const rows = table.getRowModel().rows;
    const renderCell = (
      rowIndex: number,
      getValue: () => string,
    ) => {
      const cellFn = descriptionColumn!.columnDef.cell;
      if (typeof cellFn !== "function") {
        throw new Error("Expected description column cell renderer");
      }

      return cellFn({
        row: rows[rowIndex],
        column: descriptionColumn!,
        table,
        cell: rows[rowIndex].getVisibleCells()[0],
        getValue,
        renderValue: getValue,
      } as never);
    };

    const withDescription = renderCell(
      0,
      () => rows[0].original.page.description ?? "",
    );

    const withoutDescription = renderCell(
      1,
      () => rows[1].original.page.description ?? "",
    );

    expect(withDescription).toBeTruthy();
    expect(withoutDescription).toBeTruthy();
    expect(JSON.stringify(withDescription)).toContain("Editor summary");
    expect(JSON.stringify(withoutDescription)).toContain("—");
  });

  it("offers a hidden visits trend column when traffic metrics are available", () => {
    const data = ref<PageTreeNode[]>([makeNode(makePage())]);
    const layoutMap = ref(new Map<string, string>());
    const showTrafficColumn = ref(true);

    const { table } = usePagesTable({
      data,
      layoutMap,
      showTrafficColumn,
      trafficSparklineForSlug: () => [3, 8, 5, 12, 9, 15, 11],
    });
    const trafficColumn = table.getColumn("traffic");

    expect(trafficColumn).toBeDefined();
    expect(trafficColumn!.getIsVisible()).toBe(false);

    trafficColumn!.toggleVisibility();

    expect(trafficColumn!.getIsVisible()).toBe(true);
  });
});
