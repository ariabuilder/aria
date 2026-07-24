import { describe, expect, it } from "vitest";
import { buildDiscoveryReport } from "../../lib/crawl/buildDiscoveryReport";
import {
  DiscoverySettingsSchema,
  parsePageForDiscovery,
  type PageForDiscovery,
} from "../../lib/crawl/schemas";

const pages = [
  {
    id: "index",
    slug: "index",
    title: "Home",
    status: "published",
    systemRole: "standard",
    accessMode: "public",
  },
  {
    id: "draft",
    slug: "draft",
    title: "Draft",
    status: "draft",
    systemRole: "standard",
    accessMode: "public",
  },
] satisfies PageForDiscovery[];

describe("buildDiscoveryReport", () => {
  it("marks published public pages as sitemap-ready", () => {
    const report = buildDiscoveryReport({
      siteSettings: { siteUrl: "https://example.com" },
      pages,
    });

    const home = report.rows.find((row) => row.slug === "index");
    const draft = report.rows.find((row) => row.slug === "draft");

    expect(home?.inSitemap).toBe(true);
    expect(draft?.inSitemap).toBe(false);
    expect(report.health.score).toBeGreaterThan(0);
  });

  it("excludes published pages with live noindex from the sitemap", () => {
    const report = buildDiscoveryReport({
      siteSettings: { siteUrl: "https://example.com" },
      pages: [
        {
          id: "index",
          slug: "index",
          title: "Home",
          status: "published",
          accessMode: "public",
          systemRole: "standard",
          settings: {
            seo: {
              noindex: true,
            },
          },
        },
      ],
    });

    const home = report.rows.find((row) => row.slug === "index");
    expect(home?.inSitemap).toBe(false);
    expect(home?.exclusionReason).toBe("noindex");
  });

  it("reports external canonical pages as ineligible for automatic discovery", () => {
    const report = buildDiscoveryReport({
      siteSettings: { siteUrl: "https://example.com" },
      pages: [
        {
          id: "syndicated",
          slug: "syndicated",
          title: "Syndicated",
          status: "published",
          accessMode: "public",
          systemRole: "standard",
          settings: {
            seo: {
              canonical: "https://publisher.example/articles/syndicated",
            },
          },
        },
      ],
    });

    expect(report.rows[0]).toMatchObject({
      canonicalOk: false,
      inSitemap: false,
      inLlms: false,
    });
  });

  it("accepts pages with settings but no SEO block", () => {
    const page = parsePageForDiscovery({
      id: "about",
      slug: "about",
      title: "About",
      status: "published",
      accessMode: "public",
      systemRole: "standard",
      settings: {},
    });

    const report = buildDiscoveryReport({
      siteSettings: { siteUrl: "https://example.com" },
      pages: [page],
    });

    expect(report.rows[0]?.inSitemap).toBe(true);
  });

  it("accepts pages with null publishedAt values", () => {
    const page = parsePageForDiscovery({
      id: "about",
      slug: "about",
      title: "About",
      status: "published",
      accessMode: "public",
      systemRole: "standard",
      updatedAt: "2026-06-02T00:00:00.000Z",
      publishedAt: null,
    });

    const report = buildDiscoveryReport({
      siteSettings: { siteUrl: "https://example.com" },
      pages: [page],
    });

    expect(report.rows[0]?.inSitemap).toBe(true);
  });

  it("suppresses sitemap and llms rows when search engines are discouraged", () => {
    const report = buildDiscoveryReport({
      siteSettings: {
        siteUrl: "https://example.com",
        discovery: DiscoverySettingsSchema.parse({
          discourageSearchEngines: true,
        }),
      },
      pages,
    });

    const home = report.rows.find((row) => row.slug === "index");

    expect(home?.inSitemap).toBe(false);
    expect(home?.inLlms).toBe(false);
    expect(report.health.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "discourage-search",
          status: "warning",
        }),
      ]),
    );
  });

  it("reflects sitemap and llms global off modes independently", () => {
    const sitemapOffReport = buildDiscoveryReport({
      siteSettings: {
        siteUrl: "https://example.com",
        discovery: DiscoverySettingsSchema.parse({ sitemapMode: "off" }),
      },
      pages,
    });
    const llmsOffReport = buildDiscoveryReport({
      siteSettings: {
        siteUrl: "https://example.com",
        discovery: DiscoverySettingsSchema.parse({ llmsMode: "off" }),
      },
      pages,
    });

    const sitemapOffHome = sitemapOffReport.rows.find(
      (row) => row.slug === "index",
    );
    const llmsOffHome = llmsOffReport.rows.find((row) => row.slug === "index");

    expect(sitemapOffHome?.inSitemap).toBe(false);
    expect(sitemapOffHome?.inLlms).toBe(true);
    expect(llmsOffHome?.inSitemap).toBe(true);
    expect(llmsOffHome?.inLlms).toBe(false);
  });

  it("includes authoritative discovery settings on the report payload", () => {
    const discovery = DiscoverySettingsSchema.parse({
      discourageSearchEngines: true,
      sitemapMode: "off",
    });
    const report = buildDiscoveryReport({
      siteSettings: {
        siteUrl: "https://example.com",
        discovery,
      },
      pages,
    });

    expect(report.discoverySettings).toEqual(discovery);
  });

  it("suppresses sitemap and llms rows when siteUrl is missing", () => {
    const report = buildDiscoveryReport({
      siteSettings: {},
      pages,
    });

    const home = report.rows.find((row) => row.slug === "index");

    expect(home?.inSitemap).toBe(false);
    expect(home?.inLlms).toBe(false);
    expect(report.health.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "site-url",
          status: "error",
        }),
      ]),
    );
  });
});
