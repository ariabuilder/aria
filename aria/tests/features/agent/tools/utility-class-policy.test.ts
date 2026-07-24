import { describe, expect, it } from "vitest";
import { containsUtilityClassNames } from "../../../../admin/features/Agent/lib/tools/content/utilityClassPolicy";

describe("agent utility class policy", () => {
  it("detects utility classNames anywhere in an inserted node tree", () => {
    expect(
      containsUtilityClassNames({
        type: "section",
        children: [
          {
            type: "container",
            classNames: { base: ["grid", "gap-8"] },
          },
        ],
      }),
    ).toBe(true);
  });

  it("allows customClasses and empty classNames maps", () => {
    expect(
      containsUtilityClassNames({
        customClasses: ["hero-section"],
        classNames: { base: [] },
      }),
    ).toBe(false);
  });
});
