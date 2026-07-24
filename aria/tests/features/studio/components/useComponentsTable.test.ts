import { beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";
import { useComponentsTable } from "../../../../admin/features/Studio/components/composables/useComponentsTable";
import type { Component } from "../../../../admin/composables/useBuilderData";

function createComponent(partial: Partial<Component> & { id: string }): Component {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    description: partial.description,
    category: partial.category,
    source: partial.source ?? "custom",
    tier: partial.tier ?? "free",
    isLocked: partial.isLocked ?? false,
    packId: partial.packId,
    version: partial.version,
    updatedAt: partial.updatedAt ?? null,
  };
}

describe("useComponentsTable", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("forces name column visibility and persists valid state", () => {
    const data = ref<Component[]>([createComponent({ id: "button" })]);
    const { table } = useComponentsTable({ data });

    table.setColumnVisibility({ name: false, tier: false });
    expect(table.getColumn("name")?.getIsVisible()).toBe(true);

    const raw = window.localStorage.getItem("aria:components:table-columns");
    expect(raw).toContain("\"name\":true");
  });

  it("loads with invalid storage payloads without throwing", () => {
    window.localStorage.setItem("aria:components:table-columns", "{bad-json");
    window.localStorage.setItem("aria:components:table-sorting", "{\"oops\":1}");

    const data = ref<Component[]>([createComponent({ id: "button" })]);
    const { table } = useComponentsTable({ data });
    expect(table.getAllLeafColumns().length).toBeGreaterThan(0);
  });

  it("sorts component rows through TanStack table state", () => {
    const data = ref<Component[]>([
      createComponent({ id: "beta", name: "Beta" }),
      createComponent({ id: "alpha", name: "Alpha" }),
    ]);
    const { table } = useComponentsTable({ data });

    table.getColumn("name")?.toggleSorting(false);

    expect(table.getRowModel().rows.map((row) => row.original.id)).toEqual([
      "alpha",
      "beta",
    ]);
  });
});
