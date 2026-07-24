import { describe, expect, it } from "vitest";

import { resolvePageBatchDeletePlan } from "../../../../admin/features/Studio/pages/lib/resolvePageBatchDeletePlan";

describe("resolvePageBatchDeletePlan", () => {
  const pages = [
    { slug: "index" },
    { slug: "about" },
    { slug: "team", parent: "about" },
    { slug: "careers", parent: "about" },
    { slug: "blog" },
    { slug: "post-1", parent: "blog" },
  ];

  it("skips the home page", () => {
    const plan = resolvePageBatchDeletePlan(["index", "post-1"], pages);

    expect(plan.ordered).toEqual(["post-1"]);
    expect(plan.skipped).toEqual([
      { slug: "index", reason: "Home page cannot be deleted" },
    ]);
  });

  it("skips parents that still have undeleted children", () => {
    const plan = resolvePageBatchDeletePlan(["about"], pages);

    expect(plan.ordered).toEqual([]);
    expect(plan.skipped).toEqual([
      {
        slug: "about",
        reason: "Move or delete child pages before deleting this page",
      },
    ]);
  });

  it("deletes children before parents when both are selected", () => {
    const plan = resolvePageBatchDeletePlan(
      ["about", "team", "careers"],
      pages,
    );

    expect(plan.ordered).toEqual(["team", "careers", "about"]);
    expect(plan.skipped).toEqual([]);
  });

  it("orders nested descendants before ancestors", () => {
    const plan = resolvePageBatchDeletePlan(["blog", "post-1"], pages);

    expect(plan.ordered).toEqual(["post-1", "blog"]);
    expect(plan.skipped).toEqual([]);
  });
});
