import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "../../../lib/crawl/buildSitemapXml";
import { buildCmsEntryPublicPath } from "../../../lib/cms/publicPaths";
import { mergeDiscoverySettings } from "../../../lib/crawl/schemas";
import type { DiscoverableCmsEntry, PageForDiscovery } from "../../../lib/crawl/schemas";

const templatePage: PageForDiscovery = {
  id: "post-template",
  slug: "post-template",
  status: "published",
  systemRole: "standard",
  accessMode: "public",
  updatedAt: "2026-06-01T00:00:00.000Z",
  publishedAt: "2026-06-01T00:00:00.000Z",
};

describe("buildCmsEntryPublicPath", () => {
  it("builds public paths from collection url patterns", () => {
    expect(buildCmsEntryPublicPath("/posts/{slug}", "hello-world")).toBe(
      "/posts/hello-world",
    );
  });
});

describe("buildSitemapXml cms entries", () => {
  it("includes published cms entry urls", () => {
    const cmsEntry: DiscoverableCmsEntry = {
      collectionId: "collection-posts",
      entryId: "entry-1",
      slug: "hello-world",
      pathname: "/posts/hello-world",
      updatedAt: "2026-06-02T00:00:00.000Z",
      publishedAt: "2026-06-02T00:00:00.000Z",
    };

    const xml = buildSitemapXml({
      siteSettings: {
        siteUrl: "https://example.com",
        discovery: mergeDiscoverySettings(undefined, { sitemapMode: "auto" }),
      },
      pages: [templatePage],
      cmsEntries: [cmsEntry],
    });

    expect(xml).toContain("https://example.com/posts/hello-world");
  });

  it("falls back to updatedAt when cms entry publishedAt is null", () => {
    const cmsEntry: DiscoverableCmsEntry = {
      collectionId: "collection-posts",
      entryId: "entry-1",
      slug: "hello-world",
      pathname: "/posts/hello-world",
      updatedAt: "2026-06-02T00:00:00.000Z",
      publishedAt: null,
    };

    const xml = buildSitemapXml({
      siteSettings: {
        siteUrl: "https://example.com",
        discovery: mergeDiscoverySettings(undefined, { sitemapMode: "auto" }),
      },
      pages: [templatePage],
      cmsEntries: [cmsEntry],
    });

    expect(xml).toContain("<lastmod>2026-06-02T00:00:00.000Z</lastmod>");
  });
});
