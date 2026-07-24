import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "../../lib/crawl/buildSitemapXml";
import type { PageForDiscovery } from "../../lib/crawl/schemas";

describe("buildSitemapXml", () => {
  it("uses home path / for index slug", () => {
    const pages: PageForDiscovery[] = [
      {
        id: "home",
        slug: "index",
        status: "published",
        systemRole: "standard",
        accessMode: "public",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const xml = buildSitemapXml({
      siteSettings: {
        siteUrl: "https://example.com",
        localization: {
          content: {
            defaultLocale: "en",
            locales: [
              { code: "en", label: "English", enabled: true, fallbacks: [] },
              {
                code: "fr",
                label: "Français",
                enabled: true,
                fallbacks: ["en"],
              },
            ],
          },
        },
      },
      pages,
    });

    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).not.toContain("/index");
  });

  it("excludes noindex pages", () => {
    const pages: PageForDiscovery[] = [
      {
        id: "hidden",
        slug: "hidden",
        status: "published",
        systemRole: "standard",
        accessMode: "public",
        settings: { seo: { noindex: true } },
      },
    ];

    const xml = buildSitemapXml({
      siteSettings: { siteUrl: "https://example.com" },
      pages,
    });

    expect(xml).not.toContain("hidden");
  });

  it("includes published localized page routes in automatic sitemaps", () => {
    const xml = buildSitemapXml({
      siteSettings: {
        siteUrl: "https://example.com",
        localization: {
          content: {
            defaultLocale: "en",
            locales: [
              { code: "en", label: "English", enabled: true, fallbacks: [] },
              {
                code: "fr",
                label: "Français",
                enabled: true,
                fallbacks: ["en"],
              },
            ],
          },
        },
      },
      pages: [
        {
          id: "about",
          slug: "about",
          status: "published",
          systemRole: "standard",
          accessMode: "public",
          updatedAt: "2026-07-13T12:00:00.000Z",
        },
      ],
      localizedPages: [
        {
          pageId: "about",
          locale: "fr",
          pathname: "/a-propos",
          publishedAt: "2026-07-13T12:00:00.000Z",
          noindex: false,
        },
      ],
    });

    expect(xml).toContain("<loc>https://example.com/fr/a-propos</loc>");
    expect(xml).toContain("2026-07-13T12:00:00.000Z");
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('hreflang="en" href="https://example.com/about"');
    expect(xml).toContain(
      'hreflang="fr" href="https://example.com/fr/a-propos"',
    );
    expect(xml).toContain(
      'hreflang="x-default" href="https://example.com/about"',
    );
  });

  it("excludes non-self-canonical default pages from automatic sitemap clusters", () => {
    const xml = buildSitemapXml({
      siteSettings: { siteUrl: "https://example.com" },
      pages: [
        {
          id: "syndicated",
          slug: "syndicated",
          status: "published",
          systemRole: "standard",
          accessMode: "public",
          settings: {
            seo: { canonical: "https://publisher.example/articles/syndicated" },
          },
        },
      ],
    });

    expect(xml).not.toContain("publisher.example");
    expect(xml).not.toContain("/syndicated");
  });
});
