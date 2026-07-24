import { describe, expect, it } from "vitest";
import {
  getLayoutDefaultSlotName,
  isNodeInLayoutDefaultSlot,
  migratePageRootNodeSlots,
  resolveNodeSlotForLayout,
  sortRootBlocksByLayoutSlot,
} from "../../../lib/layouts/resolveNodeSlot";

const fullWidthLayout = {
  slots: [
    { name: "header" },
    { name: "main", isDefault: true },
    { name: "footer" },
  ],
};

describe("resolveNodeSlotForLayout", () => {
  it("maps unslotted and legacy default to full-width main", () => {
    expect(resolveNodeSlotForLayout({}, fullWidthLayout)).toBe("main");
    expect(resolveNodeSlotForLayout({ slot: "default" }, fullWidthLayout)).toBe(
      "main",
    );
    expect(resolveNodeSlotForLayout({ slot: "content" }, fullWidthLayout)).toBe(
      "main",
    );
  });

  it("preserves explicit header and footer slots", () => {
    expect(
      resolveNodeSlotForLayout({ slot: "header" }, fullWidthLayout),
    ).toBe("header");
    expect(
      resolveNodeSlotForLayout({ slot: "footer" }, fullWidthLayout),
    ).toBe("footer");
    expect(resolveNodeSlotForLayout({ slot: "main" }, fullWidthLayout)).toBe(
      "main",
    );
  });

  it("falls back to default when layout has no slots", () => {
    expect(getLayoutDefaultSlotName(null)).toBe("default");
    expect(resolveNodeSlotForLayout({ slot: "footer" }, null)).toBe("footer");
  });
});

describe("isNodeInLayoutDefaultSlot", () => {
  it("groups legacy default with the layout default slot", () => {
    expect(isNodeInLayoutDefaultSlot({}, fullWidthLayout)).toBe(true);
    expect(
      isNodeInLayoutDefaultSlot({ slot: "default" }, fullWidthLayout),
    ).toBe(true);
    expect(
      isNodeInLayoutDefaultSlot({ slot: "footer" }, fullWidthLayout),
    ).toBe(false);
  });
});

describe("sortRootBlocksByLayoutSlot", () => {
  it("orders header, main (incl. default), then footer", () => {
    const blocks = [
      { id: "h", slot: "header" },
      { id: "a" },
      { id: "b" },
      { id: "f", slot: "footer" },
      { id: "c", slot: "default" },
    ];

    expect(
      sortRootBlocksByLayoutSlot(blocks, fullWidthLayout).map((b) => b.id),
    ).toEqual(["h", "a", "b", "c", "f"]);
  });

  it("keeps stable order within the same slot", () => {
    const blocks = [
      { id: "m1", slot: "main" },
      { id: "m2", slot: "main" },
      { id: "f", slot: "footer" },
    ];

    expect(
      sortRootBlocksByLayoutSlot(blocks, fullWidthLayout).map((b) => b.id),
    ).toEqual(["m1", "m2", "f"]);
  });
});

describe("migratePageRootNodeSlots", () => {
  it("rewrites unslotted and legacy slots to the layout default name", () => {
    const nodes = [
      { id: "a" },
      { id: "b", slot: "default" },
      { id: "c", slot: "content" },
      { id: "d", slot: "footer" },
    ];

    const migrated = migratePageRootNodeSlots(nodes, fullWidthLayout);
    expect(migrated).toEqual([
      { id: "a", slot: "main" },
      { id: "b", slot: "main" },
      { id: "c", slot: "main" },
      { id: "d", slot: "footer" },
    ]);
  });

  it("returns a shallow copy when layout has no slots", () => {
    const nodes = [{ id: "a", slot: "default" }];
    const migrated = migratePageRootNodeSlots(nodes, { slots: [] });
    expect(migrated).toEqual(nodes);
    expect(migrated).not.toBe(nodes);
  });
});
