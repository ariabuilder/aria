import { describe, expect, it } from "vitest";

import {
  aggregateVisitsBySlug,
  normalizeClientRequestPath,
  shouldExcludeTrafficPath,
} from "../../../lib/metrics/pathMapping";

describe("pathMapping", () => {
  it("normalizes trailing slashes and duplicate slashes", () => {
    expect(normalizeClientRequestPath("/about/")).toBe("/about");
    expect(normalizeClientRequestPath("//about//team")).toBe("/about/team");
  });

  it("excludes admin and static asset paths", () => {
    expect(shouldExcludeTrafficPath("/admin/settings")).toBe(true);
    expect(shouldExcludeTrafficPath("/_astro/page.js")).toBe(true);
    expect(shouldExcludeTrafficPath("/about")).toBe(false);
  });

  it("maps nested paths to slugs and buckets unmapped", () => {
    const pages = [
      { slug: "index" },
      { slug: "about" },
      { slug: "team", parent: "about" },
    ];

    const result = aggregateVisitsBySlug(
      [
        { path: "/about/team", visits: 10 },
        { path: "/legacy-url", visits: 3 },
        { path: "/admin", visits: 99 },
      ],
      pages,
    );

    expect(result.bySlug.team).toBe(10);
    expect(result.unmappedVisits).toBe(3);
    expect(result.bySlug.about).toBeUndefined();
  });
});
