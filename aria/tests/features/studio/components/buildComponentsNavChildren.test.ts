import { describe, expect, it } from "vitest";
import {
  buildComponentsNavChildren,
  isComponentsNavChildActive,
} from "../../../../admin/features/Studio/components/lib/buildComponentsNavChildren";

describe("buildComponentsNavChildren", () => {
  it("builds all and group children", () => {
    const children = buildComponentsNavChildren([
      { id: "grp-b", name: "Beta" },
      { id: "grp-a", name: "Alpha" },
    ]);

    expect(children[0]?.filter).toBe("all");
    expect(children[1]?.label).toBe("Alpha");
    expect(children[1]?.path).toContain("group%3Agrp-a");
  });

  it("marks list and detail active states", () => {
    const children = buildComponentsNavChildren([
      { id: "grp-1", name: "Hero" },
    ]);

    const all = children[0];
    const group = children[1];

    expect(
      isComponentsNavChildActive(all!, "/components", undefined),
    ).toBe(true);
    expect(
      isComponentsNavChildActive(group!, "/components", "group:grp-1"),
    ).toBe(true);
    expect(
      isComponentsNavChildActive(group!, "/components/hero", undefined, "grp-1"),
    ).toBe(true);
    expect(
      isComponentsNavChildActive(all!, "/components/hero", undefined, "grp-1"),
    ).toBe(false);
  });
});
