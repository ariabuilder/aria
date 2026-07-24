import { describe, expect, it } from "vitest";
import { buildGeneratedDiscoveryBaseline } from "../../lib/crawl/buildGeneratedDiscoveryBaseline";

describe("buildGeneratedDiscoveryBaseline", () => {
  const pages = [
    {
      id: "page-1",
      slug: "index",
      status: "published" as const,
      systemRole: "standard" as const,
      accessMode: "public" as const,
      title: "Home",
    },
  ];

  it("returns auto robots output even when stored custom robots exists", () => {
    const baseline = buildGeneratedDiscoveryBaseline({
      artifact: "robots",
      siteSettings: {
        siteUrl: "https://example.com",
        discovery: {
          robotsMode: "custom",
          robotsCustom: "User-agent: *\nDisallow: /secret",
          sitemapMode: "auto",
          llmsMode: "auto",
          includeSitemapInRobots: true,
          discourageSearchEngines: false,
          trailingSlashPolicy: "strip",
          sitemapPingOnPublish: false,
        },
      },
      pages,
    });

    expect(baseline).toContain("Allow: /");
    expect(baseline).not.toContain("/secret");
  });

  it("returns auto sitemap output when stored mode is off", () => {
    const baseline = buildGeneratedDiscoveryBaseline({
      artifact: "sitemap",
      siteSettings: {
        siteUrl: "https://example.com",
        discovery: {
          robotsMode: "auto",
          sitemapMode: "off",
          llmsMode: "auto",
          includeSitemapInRobots: true,
          discourageSearchEngines: false,
          trailingSlashPolicy: "strip",
          sitemapPingOnPublish: false,
        },
      },
      pages,
    });

    expect(baseline).toContain("<urlset");
    expect(baseline).toContain("https://example.com/");
  });

  it("returns sitemap baseline for editor seed even when search engines are discouraged", () => {
    const baseline = buildGeneratedDiscoveryBaseline({
      artifact: "sitemap",
      siteSettings: {
        siteUrl: "https://example.com",
        discovery: {
          robotsMode: "auto",
          sitemapMode: "auto",
          llmsMode: "auto",
          includeSitemapInRobots: true,
          discourageSearchEngines: true,
          trailingSlashPolicy: "strip",
          sitemapPingOnPublish: false,
        },
      },
      pages,
      forEditorSeed: true,
    });

    expect(baseline).toContain("<urlset");
    expect(baseline).toContain("https://example.com/");
  });

  it("returns auto llms output when stored custom llms exists", () => {
    const baseline = buildGeneratedDiscoveryBaseline({
      artifact: "llms",
      siteSettings: {
        siteUrl: "https://example.com",
        siteName: "Example",
        discovery: {
          robotsMode: "auto",
          sitemapMode: "auto",
          llmsMode: "custom",
          llmsCustom: "Custom llms only",
          includeSitemapInRobots: true,
          discourageSearchEngines: false,
          trailingSlashPolicy: "strip",
          sitemapPingOnPublish: false,
        },
      },
      pages,
    });

    expect(baseline).toContain("# Example");
    expect(baseline).not.toContain("Custom llms only");
  });
});
