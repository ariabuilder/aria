import { escapeXml } from "../utils/xml";
import type { SiteSettings } from "../storage/adapter";
import { isPageDiscoverable } from "./discoverability";
import { normalizeBaseUrl } from "./normalizeBaseUrl";
import { isPageSelfCanonical, resolvePageAbsoluteUrl } from "./resolvePageLoc";
import { DiscoverySettingsSchema, type PageForDiscovery } from "./schemas";

export function buildImageSitemapXml(input: {
  siteSettings: SiteSettings | null | undefined;
  pages: readonly PageForDiscovery[];
}): string | null {
  const discovery = DiscoverySettingsSchema.parse(
    input.siteSettings?.discovery ?? {},
  );
  const baseUrl = normalizeBaseUrl(input.siteSettings?.siteUrl);

  if (
    discovery.discourageSearchEngines ||
    discovery.sitemapMode === "off" ||
    !baseUrl
  ) {
    return null;
  }

  const discoverable = input.pages.filter(
    (page) =>
      isPageDiscoverable(page) &&
      isPageSelfCanonical({ siteUrl: baseUrl, page, pages: input.pages }),
  );
  const urls = discoverable
    .map((page) => {
      const imageUrl =
        page.settings?.seo?.ogImage?.trim() ||
        input.siteSettings?.ogImage?.trim() ||
        undefined;
      if (!imageUrl) {
        return null;
      }
      const pageUrl =
        resolvePageAbsoluteUrl({
          siteUrl: baseUrl,
          page,
          pages: input.pages,
          siteSettings: input.siteSettings,
        }) ?? baseUrl;
      const title = page.title?.trim() || page.slug || "Page";
      return [
        "  <url>",
        `    <loc>${escapeXml(pageUrl)}</loc>`,
        "    <image:image>",
        `      <image:loc>${escapeXml(imageUrl.startsWith("http") ? imageUrl : `${baseUrl}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`)}</image:loc>`,
        `      <image:title>${escapeXml(title)}</image:title>`,
        "    </image:image>",
        "  </url>",
      ].join("\n");
    })
    .filter((entry): entry is string => entry !== null);

  if (urls.length === 0) {
    return null;
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
