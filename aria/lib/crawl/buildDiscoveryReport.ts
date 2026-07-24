import { buildStudioPagePathMap } from "../pages/publicPaths";
import type { RedirectRule } from "../redirects/schemas";
import type { SiteSettings } from "../storage/adapter";
import { getExclusionReason, isPageDiscoverable } from "./discoverability";
import { normalizeBaseUrl } from "./normalizeBaseUrl";
import { isPageSelfCanonical, resolvePageAbsoluteUrl } from "./resolvePageLoc";
import { runSiteSeoAudits } from "./audits";
import { buildSiteHealthChecks } from "./siteHealth";
import {
  DiscoveryReportSchema,
  DiscoverySettingsSchema,
  type DiscoveryReport,
  type PageForDiscovery,
} from "./schemas";

function buildRedirectLookup(
  redirects: readonly RedirectRule[] | undefined,
): Set<string> {
  const active = new Set<string>();
  if (!redirects) {
    return active;
  }
  for (const rule of redirects) {
    if (rule.enabled) {
      active.add(rule.fromPath);
    }
  }
  return active;
}

export function buildDiscoveryReport(input: {
  siteSettings: SiteSettings | null | undefined;
  pages: readonly PageForDiscovery[];
  redirects?: readonly RedirectRule[];
}): DiscoveryReport {
  const generatedAt = new Date().toISOString();
  const siteUrl = input.siteSettings?.siteUrl?.trim();
  const baseUrl = normalizeBaseUrl(siteUrl);
  const discovery = DiscoverySettingsSchema.parse(
    input.siteSettings?.discovery ?? {},
  );
  const sitemapGloballyEnabled =
    Boolean(baseUrl) &&
    !discovery.discourageSearchEngines &&
    discovery.sitemapMode !== "off";
  const llmsGloballyEnabled =
    Boolean(baseUrl) &&
    !discovery.discourageSearchEngines &&
    discovery.llmsMode !== "off";
  const pathMap = buildStudioPagePathMap(
    input.pages.map((page) => ({ slug: page.slug, parent: page.parent })),
  );
  const redirectLookup = buildRedirectLookup(input.redirects);

  const rows = input.pages.map((page) => {
    const publicPath = pathMap.get(page.slug) ?? `/${page.slug}`;
    const exclusionReason = getExclusionReason(page);
    const discoverable = isPageDiscoverable(page);
    const selfCanonical =
      Boolean(baseUrl) &&
      isPageSelfCanonical({ siteUrl: baseUrl!, page, pages: input.pages });
    const absoluteUrl =
      baseUrl &&
      resolvePageAbsoluteUrl({
        siteUrl: baseUrl,
        page,
        pages: input.pages,
        siteSettings: input.siteSettings,
      });

    return {
      pageId: page.id,
      slug: page.slug,
      title: page.title?.trim() || page.slug || "Untitled",
      publicPath,
      absoluteUrl: absoluteUrl || undefined,
      inSitemap: discoverable && selfCanonical && sitemapGloballyEnabled,
      inLlms: discoverable && selfCanonical && llmsGloballyEnabled,
      canonicalOk: selfCanonical,
      exclusionReason,
      hasActiveRedirect: redirectLookup.has(publicPath),
    };
  });

  const audits = runSiteSeoAudits(input.pages, input.siteSettings);
  const health = buildSiteHealthChecks({
    siteSettings: input.siteSettings,
    rows,
    audits,
  });

  return DiscoveryReportSchema.parse({
    generatedAt,
    siteUrl: siteUrl || undefined,
    discoverySettings: discovery,
    rows,
    audits,
    health,
  });
}
