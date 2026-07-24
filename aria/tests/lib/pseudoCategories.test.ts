import { describe, expect, it } from "vitest";
import { PseudoPresetIdSchema } from "../../lib/styles/pseudoSelectors";
import { PSEUDO_CATEGORIES } from "../../admin/features/Inspector/data/pseudoCategories";

describe("pseudoCategories", () => {
  it("parses curated categories at module load", () => {
    expect(PSEUDO_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("references only valid preset ids in every category", () => {
    for (const category of PSEUDO_CATEGORIES) {
      for (const state of category.states) {
        expect(PseudoPresetIdSchema.parse(state)).toBe(state);
      }
    }
  });

  it("includes relational presets", () => {
    const relational = PSEUDO_CATEGORIES.find(
      (category) => category.id === "relational",
    );
    expect(relational?.states).toContain("has-any-child");
    expect(relational?.states).toContain("has-child");
  });
});
