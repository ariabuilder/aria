import { describe, expect, it } from "vitest";
import { groupComponentsByCategory } from "../../../../admin/features/Studio/components/lib/groupComponentsByCategory";
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

describe("groupComponentsByCategory", () => {
  it("normalizes category labels and puts uncategorized last", () => {
    const groups = groupComponentsByCategory([
      createComponent({ id: "a", category: " Marketing  " }),
      createComponent({ id: "b", category: "" }),
      createComponent({ id: "c", category: "Marketing" }),
    ]);

    expect(groups[0]?.label).toBe("Marketing");
    expect(groups[0]?.items.map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(groups[1]?.label).toBe("Uncategorized");
  });
});
