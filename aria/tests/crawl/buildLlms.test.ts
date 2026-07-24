import { describe, expect, it } from "vitest";
import { buildLlmsTxt } from "../../lib/crawl/buildLlmsTxt";
import type { PageForDiscovery } from "../../lib/crawl/schemas";

const publishedPage = {
  id: "about",
  slug: "about",
  title: "About",
  description: "About us",
  status: "published",
  systemRole: "standard",
  accessMode: "public",
} satisfies PageForDiscovery;

describe("buildLlmsTxt", () => {
  it("builds auto llms.txt with discoverable pages", () => {
    const llms = buildLlmsTxt({
      siteSettings: {
        siteName: "Example",
        siteUrl: "https://example.com",
        discovery: {
          llmsMode: "auto",
          robotsMode: "auto",
          sitemapMode: "auto",
          includeSitemapInRobots: true,
          discourageSearchEngines: false,
          trailingSlashPolicy: "strip",
          sitemapPingOnPublish: false,
        },
      },
      pages: [publishedPage],
    });

    expect(llms).toContain("# Example");
    expect(llms).toContain("https://example.com/llms-full.txt");
    expect(llms).toContain("[About](https://example.com/about)");
  });

  it("returns null when llms mode is off", () => {
    expect(
      buildLlmsTxt({
        siteSettings: {
          siteUrl: "https://example.com",
          discovery: {
            llmsMode: "off",
            robotsMode: "auto",
            sitemapMode: "auto",
            includeSitemapInRobots: true,
            discourageSearchEngines: false,
            trailingSlashPolicy: "strip",
            sitemapPingOnPublish: false,
          },
        },
        pages: [publishedPage],
      }),
    ).toBeNull();
  });

  it("does not list pages with an external canonical", () => {
    const llms = buildLlmsTxt({
      siteSettings: { siteUrl: "https://example.com" },
      pages: [
        {
          ...publishedPage,
          settings: {
            seo: { canonical: "https://publisher.example/about" },
          },
        },
      ],
    });

    expect(llms).not.toContain("publisher.example");
    expect(llms).not.toContain("[About]");
  });
});
