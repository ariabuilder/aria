import { describe, expect, it } from "vitest";
import { buildRobotsTxt } from "../../lib/crawl/buildRobotsTxt";

describe("buildRobotsTxt", () => {
  it("includes sitemap line in auto mode", () => {
    const robots = buildRobotsTxt({
      siteSettings: {
        siteUrl: "https://example.com",
        discovery: {
          robotsMode: "auto",
          sitemapMode: "auto",
          llmsMode: "auto",
          includeSitemapInRobots: true,
          discourageSearchEngines: false,
          trailingSlashPolicy: "strip",
          sitemapPingOnPublish: false,
        },
      },
    });

    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://example.com/sitemap.xml");
    expect(robots).toContain("Sitemap: https://example.com/sitemap-images.xml");
  });

  it("disallows all when discourageSearchEngines is enabled", () => {
    const robots = buildRobotsTxt({
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
    });

    expect(robots).toContain("Disallow: /");
    expect(robots).not.toContain("Allow: /");
  });

  it("adds AI training bot blocks when configured", () => {
    const robots = buildRobotsTxt({
      siteSettings: {
        siteUrl: "https://example.com",
        discovery: {
          robotsMode: "auto",
          sitemapMode: "auto",
          llmsMode: "auto",
          includeSitemapInRobots: true,
          discourageSearchEngines: false,
          trailingSlashPolicy: "strip",
          sitemapPingOnPublish: false,
          aiBotPolicy: "block-training",
        },
      },
    });

    expect(robots).toContain("User-agent: GPTBot");
    expect(robots).toContain("Disallow: /");
  });
});
