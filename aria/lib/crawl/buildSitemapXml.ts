import { escapeXml } from "../utils/xml";
import type { SiteSettings } from "../storage/adapter";
import { isPageDiscoverable } from "./discoverability";
import { normalizeBaseUrl } from "./normalizeBaseUrl";
import { isPageSelfCanonical, resolvePageAbsoluteUrl } from "./resolvePageLoc";
import {
  DiscoverySettingsSchema,
  type DiscoverySettings,
  type DiscoverableCmsEntry,
  type LocalizedPageForDiscovery,
  type PageForDiscovery,
} from "./schemas";
import { validateSitemapCustom } from "./validateCustomArtifacts";
import { normalizeContentLocalization } from "../localization/contentLocale";
import { localizePublicPath } from "../localization/publicRoutes";

function resolveDiscoverySettings(
  siteSettings: SiteSettings | null | undefined,
): DiscoverySettings {
  return DiscoverySettingsSchema.parse(siteSettings?.discovery ?? {});
}

function formatLastModValue(raw: string | null | undefined): string {
  if (typeof raw === "string" && raw.length > 0) {
    return new Date(raw).toISOString();
  }
  return new Date().toISOString();
}

function formatLastMod(page: PageForDiscovery): string {
  return formatLastModValue(page.publishedAt ?? page.updatedAt);
}

function formatCmsEntryLastMod(entry: DiscoverableCmsEntry): string {
  return formatLastModValue(entry.publishedAt ?? entry.updatedAt);
}

function joinBaseUrl(baseUrl: string, pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${baseUrl.replace(/\/+$/, "")}${normalizedPath}`;
}

type SitemapUrlEntry = {
  loc: string;
  lastmod: string;
  alternates?: Array<{ locale: string; href: string }>;
  defaultLocale?: string;
};

function buildSitemapUrlEntries(input: {
  baseUrl: string;
  pages: readonly PageForDiscovery[];
  cmsEntries?: readonly DiscoverableCmsEntry[];
  localizedPages?: readonly LocalizedPageForDiscovery[];
  allPages: readonly PageForDiscovery[];
  siteSettings: SiteSettings | null | undefined;
}): SitemapUrlEntry[] {
  const localization = normalizeContentLocalization(
    input.siteSettings?.localization?.content,
  );
  const pageUrls = input.pages.flatMap((page) => {
    if (
      !isPageSelfCanonical({
        siteUrl: input.baseUrl,
        page,
        pages: input.allPages,
      })
    ) {
      return [];
    }
    const loc =
      resolvePageAbsoluteUrl({
        siteUrl: input.baseUrl,
        page,
        pages: input.allPages,
        siteSettings: input.siteSettings,
      }) ?? input.baseUrl;
    return [
      {
        pageId: page.id,
        locale: localization.defaultLocale,
        loc,
        lastmod: formatLastMod(page),
      },
    ];
  });

  const cmsUrls = (input.cmsEntries ?? []).map((entry) => ({
    loc: joinBaseUrl(input.baseUrl, entry.pathname),
    lastmod: formatCmsEntryLastMod(entry),
  }));

  const localizedUrls = (input.localizedPages ?? []).flatMap((page) => {
    try {
      return [
        {
          pageId: page.pageId,
          locale: page.locale,
          loc: joinBaseUrl(
            input.baseUrl,
            localizePublicPath({
              pathname: page.pathname,
              locale: page.locale,
              settings: localization,
            }),
          ),
          lastmod: formatLastModValue(page.publishedAt),
        },
      ];
    } catch {
      // Discovery never exposes a stale route after a locale policy change.
      return [];
    }
  });

  const alternatesByPage = new Map<
    string,
    Array<{ locale: string; href: string }>
  >();
  for (const entry of [...pageUrls, ...localizedUrls]) {
    const alternates = alternatesByPage.get(entry.pageId) ?? [];
    alternates.push({ locale: entry.locale, href: entry.loc });
    alternatesByPage.set(entry.pageId, alternates);
  }

  const localizedPageEntries = [...pageUrls, ...localizedUrls].map((entry) => ({
    loc: entry.loc,
    lastmod: entry.lastmod,
    alternates: alternatesByPage.get(entry.pageId),
    defaultLocale: localization.defaultLocale,
  }));
  return [...localizedPageEntries, ...cmsUrls];
}

export const MAX_URLS_PER_SITEMAP = 50_000;

export function buildSitemapChunkXml(input: {
  siteSettings: SiteSettings | null | undefined;
  pages: readonly PageForDiscovery[];
  cmsEntries?: readonly DiscoverableCmsEntry[];
  localizedPages?: readonly LocalizedPageForDiscovery[];
  chunkNumber: number;
}): string | null {
  const discovery = resolveDiscoverySettings(input.siteSettings);
  const baseUrl = normalizeBaseUrl(input.siteSettings?.siteUrl);

  if (
    discovery.discourageSearchEngines ||
    discovery.sitemapMode === "off" ||
    !baseUrl ||
    input.chunkNumber < 1
  ) {
    return null;
  }

  const discoverablePages = input.pages.filter(isPageDiscoverable);
  const urlEntries = buildSitemapUrlEntries({
    baseUrl,
    pages: discoverablePages,
    cmsEntries: input.cmsEntries,
    localizedPages: input.localizedPages,
    allPages: input.pages,
    siteSettings: input.siteSettings,
  });
  const start = (input.chunkNumber - 1) * MAX_URLS_PER_SITEMAP;
  const chunk = urlEntries.slice(start, start + MAX_URLS_PER_SITEMAP);
  if (chunk.length === 0) {
    return null;
  }

  return buildUrlsetXmlFromEntries(chunk);
}

export function buildSitemapXml(input: {
  siteSettings: SiteSettings | null | undefined;
  pages: readonly PageForDiscovery[];
  cmsEntries?: readonly DiscoverableCmsEntry[];
  localizedPages?: readonly LocalizedPageForDiscovery[];
}): string | null {
  const discovery = resolveDiscoverySettings(input.siteSettings);
  const baseUrl = normalizeBaseUrl(input.siteSettings?.siteUrl);

  if (discovery.discourageSearchEngines || discovery.sitemapMode === "off") {
    return null;
  }

  if (discovery.sitemapMode === "custom" && discovery.sitemapCustom?.trim()) {
    const custom = discovery.sitemapCustom.trim();
    if (!baseUrl) {
      return null;
    }
    const validationErrors = validateSitemapCustom(custom, {
      siteUrl: baseUrl,
    });
    if (validationErrors.length > 0) {
      return null;
    }
    return custom;
  }

  if (!baseUrl) {
    return null;
  }

  const discoverablePages = input.pages.filter(isPageDiscoverable);
  const urlEntries = buildSitemapUrlEntries({
    baseUrl,
    pages: discoverablePages,
    cmsEntries: input.cmsEntries,
    localizedPages: input.localizedPages,
    allPages: input.pages,
    siteSettings: input.siteSettings,
  });

  if (urlEntries.length > MAX_URLS_PER_SITEMAP) {
    return buildSitemapIndexXml({
      baseUrl,
      urlCount: urlEntries.length,
    });
  }

  return buildUrlsetXmlFromEntries(urlEntries);
}

function buildSitemapIndexXml(input: {
  baseUrl: string;
  urlCount: number;
}): string {
  const chunks: string[] = [];
  for (let index = 0; index < input.urlCount; index += MAX_URLS_PER_SITEMAP) {
    const chunkNumber = Math.floor(index / MAX_URLS_PER_SITEMAP) + 1;
    chunks.push(
      `  <sitemap>\n    <loc>${escapeXml(`${input.baseUrl}/sitemap-${chunkNumber}.xml`)}</loc>\n  </sitemap>`,
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...chunks,
    "</sitemapindex>",
    "",
  ].join("\n");
}

function buildUrlsetXmlFromEntries(
  entries: readonly SitemapUrlEntry[],
): string {
  const urls = entries.map((entry) => {
    const alternates =
      entry.alternates?.map(
        (alternate) =>
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.locale)}" href="${escapeXml(alternate.href)}" />`,
      ) ?? [];
    const defaultAlternate = entry.alternates?.find(
      (alternate) => alternate.locale === entry.defaultLocale,
    );
    if (defaultAlternate) {
      alternates.push(
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(defaultAlternate.href)}" />`,
      );
    }
    return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>${alternates.length ? `\n${alternates.join("\n")}` : ""}\n  </url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
