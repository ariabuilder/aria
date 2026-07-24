import { describe, expect, it } from "vitest";

import {
  buildStudioPagePathMap,
  resolveAbsoluteSiteUrl,
  resolvePublicPagePath,
} from "../../../lib/pages/publicPaths";

interface TestPage {
  id: string;
  slug: string;
  parent?: string;
}

function createPage(
  overrides: Partial<TestPage> & Pick<TestPage, "id" | "slug">,
): TestPage {
  return {
    id: overrides.id,
    slug: overrides.slug,
    parent: overrides.parent,
  };
}

describe("buildStudioPagePathMap", () => {
  it("builds stable public paths for home, nested, and orphaned pages", () => {
    const pages: TestPage[] = [
      createPage({ id: "home", slug: "index" }),
      createPage({ id: "about", slug: "about" }),
      createPage({ id: "team", slug: "team", parent: "about" }),
      createPage({ id: "careers", slug: "careers", parent: "team" }),
      createPage({ id: "orphan", slug: "orphan", parent: "missing" }),
    ];

    const paths = buildStudioPagePathMap(pages);

    expect(paths.get("index")).toBe("/");
    expect(paths.get("about")).toBe("/about");
    expect(paths.get("team")).toBe("/about/team");
    expect(paths.get("careers")).toBe("/about/team/careers");
    expect(paths.get("orphan")).toBe("/orphan");
  });

  it("falls back to the page slug when parent references loop", () => {
    const pages: TestPage[] = [
      createPage({ id: "alpha", slug: "alpha", parent: "beta" }),
      createPage({ id: "beta", slug: "beta", parent: "alpha" }),
    ];

    const paths = buildStudioPagePathMap(pages);

    expect(paths.get("alpha")).toBeTruthy();
    expect(paths.get("beta")).toBeTruthy();
  });
});

describe("resolvePublicPagePath", () => {
  it("matches buildStudioPagePathMap for nested slugs", () => {
    const pages: TestPage[] = [
      createPage({ id: "home", slug: "index" }),
      createPage({ id: "about", slug: "about" }),
      createPage({ id: "team", slug: "team", parent: "about" }),
    ];

    expect(resolvePublicPagePath("team", pages)).toBe("/about/team");
    expect(resolvePublicPagePath("index", pages)).toBe("/");
  });
});

describe("resolveAbsoluteSiteUrl", () => {
  it("prefixes relative paths with the site URL", () => {
    expect(resolveAbsoluteSiteUrl("https://example.com", "/uploads/hero.jpg")).toBe(
      "https://example.com/uploads/hero.jpg",
    );
    expect(resolveAbsoluteSiteUrl("https://example.com/", "blog")).toBe(
      "https://example.com/blog",
    );
  });

  it("returns absolute URLs unchanged", () => {
    expect(
      resolveAbsoluteSiteUrl("https://example.com", "https://cdn.example.com/a.png"),
    ).toBe("https://cdn.example.com/a.png");
  });
});
