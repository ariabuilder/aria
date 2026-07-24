import { describe, expect, it } from "vitest";
import type { SelectableComponent } from "../../../admin/features/Core";
import {
  filterComponentPickerItems,
} from "../../../admin/features/Blocks/dialogs/componentPickerModel";

const components: SelectableComponent[] = [
  {
    id: "hero-primary",
    name: "Primary Hero",
    description: "A large product introduction",
    category: " Hero ",
  },
  {
    id: "hero-secondary",
    name: "Secondary Hero",
    description: "A compact landing header",
    category: "hero",
  },
  {
    id: "pricing-table",
    name: "Pricing Table",
    category: "Pricing",
  },
  {
    id: "loose-component",
    name: "Loose Component",
  },
];

describe("component picker model", () => {
  it("filters by effective group assignment and search together", () => {
    const result = filterComponentPickerItems({
      components,
      activeFilter: "group:marketing",
      searchQuery: "compact",
      effectiveAssignments: {
        "hero-primary": "marketing",
        "hero-secondary": "marketing",
        "pricing-table": "commerce",
      },
    });

    expect(result.map((component) => component.id)).toEqual([
      "hero-secondary",
    ]);
  });

  it("does not treat component categories as a search filter", () => {
    const result = filterComponentPickerItems({
      components,
      activeFilter: "all",
      searchQuery: "pricing",
      effectiveAssignments: {
        "hero-primary": "featured",
        "hero-secondary": "marketing",
      },
    });

    expect(result.map((component) => component.id)).toEqual([
      "pricing-table",
    ]);
  });

  it("searches identifiers and sorts results by component name", () => {
    const result = filterComponentPickerItems({
      components,
      activeFilter: "all",
      searchQuery: "hero",
    });

    expect(result.map((component) => component.name)).toEqual([
      "Primary Hero",
      "Secondary Hero",
    ]);
  });
});
