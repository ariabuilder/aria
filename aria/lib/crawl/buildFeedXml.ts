import { escapeXml } from "../utils/xml";
import type { SiteSettings } from "../storage/adapter";
import { isPageDiscoverable } from "./discoverability";
import { normalizeBaseUrl } from "./normalizeBaseUrl";
import { isPageSelfCanonical, resolvePageAbsoluteUrl } from "./resolvePageLoc";
import {
  DiscoverySettingsSchema,
  LocalizedCollectionFeedSchema,
  type LocalizedCollectionFeed,
  type PageForDiscovery,
} from "./schemas";

function rssDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date(0).toUTCString()
    : date.toUTCString();
}

/** Deterministic collection-feed XML. Input is already policy-projected. */
export function buildLocalizedCollectionFeedXml(
  input: LocalizedCollectionFeed,
): string {
  const feed = LocalizedCollectionFeedSchema.parse(input);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${escapeXml(feed.title)}</title>`,
    `    <link>${escapeXml(feed.link)}</link>`,
    feed.description
      ? `    <description>${escapeXml(feed.description)}</description>`
      : "",
    `    <lastBuildDate>${escapeXml(rssDate(feed.updatedAt))}</lastBuildDate>`,
    ...feed.items.flatMap((item) => [
      "    <item>",
      `      <title>${escapeXml(item.title)}</title>`,
      `      <link>${escapeXml(item.link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
      item.description
        ? `      <description>${escapeXml(item.description)}</description>`
        : "",
      `      <pubDate>${escapeXml(rssDate(item.publishedAt ?? item.updatedAt))}</pubDate>`,
      "    </item>",
    ]),
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildFeedXml(input: {
  siteSettings: SiteSettings | null | undefined;
  pages: readonly PageForDiscovery[];
}): string | null {
  const discovery = DiscoverySettingsSchema.parse(
    input.siteSettings?.discovery ?? {},
  );
  const baseUrl = normalizeBaseUrl(input.siteSettings?.siteUrl);

  if (discovery.discourageSearchEngines || !baseUrl) {
    return null;
  }

  const siteName =
    input.siteSettings?.siteName?.trim() ||
    input.siteSettings?.seoTitle?.trim() ||
    "Site";
  const siteDescription =
    input.siteSettings?.siteDescription?.trim() ||
    input.siteSettings?.seoDescription?.trim() ||
    "";

  const discoverable = input.pages.filter(
    (page) =>
      isPageDiscoverable(page) &&
      isPageSelfCanonical({ siteUrl: baseUrl, page, pages: input.pages }),
  );
  const items = discoverable
    .map((page) => {
      const link = resolvePageAbsoluteUrl({
        siteUrl: baseUrl,
        page,
        pages: input.pages,
        siteSettings: input.siteSettings,
      });
      if (!link) {
        return null;
      }
      const title = page.title?.trim() || page.slug || "Page";
      const description =
        page.description?.trim() ||
        page.settings?.seo?.description?.trim() ||
        "";
      const pubDate = page.publishedAt ?? page.updatedAt;
      const pubDateIso =
        typeof pubDate === "string" && pubDate.length > 0
          ? new Date(pubDate).toUTCString()
          : new Date().toUTCString();

      return [
        "    <item>",
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        description
          ? `      <description>${escapeXml(description)}</description>`
          : "",
        `      <pubDate>${escapeXml(pubDateIso)}</pubDate>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter((item): item is string => item !== null);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${escapeXml(siteName)}</title>`,
    `    <link>${escapeXml(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)}</link>`,
    siteDescription
      ? `    <description>${escapeXml(siteDescription)}</description>`
      : "",
    `    <lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}
