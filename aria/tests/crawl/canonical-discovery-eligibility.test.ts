import { describe, expect, it } from "vitest";

import { buildFeedXml } from "../../lib/crawl/buildFeedXml";
import { buildImageSitemapXml } from "../../lib/crawl/buildImageSitemapXml";
import type { PageForDiscovery } from "../../lib/crawl/schemas";

const syndicated: PageForDiscovery = {
  id: "syndicated",
  slug: "syndicated",
  title: "Syndicated article",
  status: "published",
  systemRole: "standard",
  accessMode: "public",
  settings: {
    seo: {
      canonical: "https://publisher.example/articles/syndicated",
      ogImage: "/uploads/syndicated.png",
    },
  },
};

describe("canonical discovery eligibility", () => {
  it("keeps external-canonical pages out of automatic feeds and image sitemaps", () => {
    const siteSettings = { siteUrl: "https://example.com" };
    const feed = buildFeedXml({ siteSettings, pages: [syndicated] });
    const imageSitemap = buildImageSitemapXml({
      siteSettings,
      pages: [syndicated],
    });

    expect(feed).not.toContain("Syndicated article");
    expect(feed).not.toContain("publisher.example");
    expect(imageSitemap).toBeNull();
  });
});
