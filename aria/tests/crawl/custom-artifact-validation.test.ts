import { describe, expect, it } from "vitest";
import {
  validateDiscoverySettings,
  validateLlmsCustom,
  validateRobotsCustom,
  validateSitemapCustom,
} from "../../lib/crawl/validateCustomArtifacts";

describe("validateCustomArtifacts", () => {
  it("rejects unsafe sitemap loc URLs", () => {
    const errors = validateSitemapCustom(
      `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://evil.com/</loc></url></urlset>`,
      { siteUrl: "https://example.com" },
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects javascript links in llms custom body", () => {
    const errors = validateLlmsCustom("Visit javascript:alert(1)");
    expect(errors.some((error) => error.field === "llmsCustom")).toBe(true);
  });

  it("rejects off-origin sitemap lines in robots custom body", () => {
    const errors = validateRobotsCustom(
      "Sitemap: https://evil.com/sitemap.xml",
      {
        siteUrl: "https://example.com",
      },
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("validateDiscoverySettings", () => {
  const invalidRobotsCustom = "Sitemap: https://evil.com/sitemap.xml";

  it("does not validate inactive custom robots content in auto mode", () => {
    const errors = validateDiscoverySettings(
      {
        sitemapMode: "auto",
        robotsMode: "auto",
        includeSitemapInRobots: true,
        llmsMode: "auto",
        discourageSearchEngines: false,
        trailingSlashPolicy: "strip",
        sitemapPingOnPublish: false,
        robotsCustom: invalidRobotsCustom,
      },
      { siteUrl: "https://example.com" },
    );

    expect(errors).toEqual([]);
  });

  it("validates custom robots content when robots mode is custom", () => {
    const errors = validateDiscoverySettings(
      {
        sitemapMode: "auto",
        robotsMode: "custom",
        includeSitemapInRobots: true,
        llmsMode: "auto",
        discourageSearchEngines: false,
        trailingSlashPolicy: "strip",
        sitemapPingOnPublish: false,
        robotsCustom: invalidRobotsCustom,
      },
      { siteUrl: "https://example.com" },
    );

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.field === "robotsCustom")).toBe(true);
  });

  it("allows unrelated settings when stale invalid custom content is inactive", () => {
    const errors = validateDiscoverySettings(
      {
        sitemapMode: "off",
        sitemapCustom: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://evil.com/</loc></url></urlset>`,
        robotsMode: "auto",
        includeSitemapInRobots: true,
        llmsMode: "auto",
        discourageSearchEngines: true,
        trailingSlashPolicy: "strip",
        sitemapPingOnPublish: true,
        robotsCustom: invalidRobotsCustom,
      },
      { siteUrl: "https://example.com" },
    );

    expect(errors).toEqual([]);
  });
});
