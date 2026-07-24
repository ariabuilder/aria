import type { StudioI18n, StudioMessageKey } from "@/i18n";
import type {
  DiscoveryReportRow,
  SiteHealthCheck,
  SiteSeoAudit,
} from "@/lib/crawl/schemas";

const HEALTH_LABEL_KEYS: Readonly<Record<string, StudioMessageKey>> = {
  "site-url": "settings.discovery.health.siteUrlConfigured",
  "indexable-pages": "settings.discovery.health.indexablePages",
  "discourage-search": "settings.discovery.health.searchEngineVisibility",
  "llms-visibility": "settings.discovery.health.aiDiscovery",
  "domain-alignment": "settings.discovery.health.domainAlignment",
  "seo-errors": "settings.discovery.health.seoErrors",
  "seo-warnings": "settings.discovery.health.seoWarnings",
};

const HEALTH_MESSAGE_KEYS: Readonly<Record<string, StudioMessageKey>> = {
  "Add a site URL in General settings.": "settings.discovery.health.addSiteUrl",
  "Sitemap generation needs a site URL.":
    "settings.discovery.health.sitemapNeedsSiteUrl",
  "Search engine visibility is discouraged, so sitemap entries are suppressed.":
    "settings.discovery.health.visibilityDiscouraged",
  "sitemap.xml is turned off.": "settings.discovery.health.sitemapOff",
  "No pages are currently discoverable.":
    "settings.discovery.health.noDiscoverablePages",
  "Discourage search engines is enabled.":
    "settings.discovery.health.discourageEnabled",
  "llms.txt is turned off.": "settings.discovery.health.llmsOff",
  "Custom domain may not match site URL.":
    "settings.discovery.health.domainMismatch",
  "Unable to validate custom domain alignment.":
    "settings.discovery.health.domainValidationFailed",
};

export interface DiscoveryHealthTranslationContext {
  rows: readonly DiscoveryReportRow[];
  audits: readonly SiteSeoAudit[];
  t: StudioI18n["t"];
}

function countMessage(
  count: number,
  singularKey: StudioMessageKey,
  pluralKey: StudioMessageKey,
  t: StudioI18n["t"],
): string {
  return t(count === 1 ? singularKey : pluralKey, { count });
}

function localizeHealthMessage(
  check: SiteHealthCheck,
  context: DiscoveryHealthTranslationContext,
): string | undefined {
  if (!check.message) return undefined;

  if (
    check.id === "indexable-pages" &&
    /^\d+ page\(s\) in sitemap$/.test(check.message)
  ) {
    const count = context.rows.filter((row) => row.inSitemap).length;
    return countMessage(
      count,
      "settings.discovery.health.pageInSitemap",
      "settings.discovery.health.pagesInSitemap",
      context.t,
    );
  }

  if (
    check.id === "seo-errors" &&
    /^\d+ critical issue\(s\) found\.$/.test(check.message)
  ) {
    const count = context.audits.filter(
      (audit) => audit.severity === "error",
    ).length;
    return countMessage(
      count,
      "settings.discovery.health.criticalIssueFound",
      "settings.discovery.health.criticalIssuesFound",
      context.t,
    );
  }

  if (
    check.id === "seo-warnings" &&
    /^\d+ warning\(s\) found\.$/.test(check.message)
  ) {
    const count = context.audits.filter(
      (audit) => audit.severity === "warning",
    ).length;
    return countMessage(
      count,
      "settings.discovery.health.warningFound",
      "settings.discovery.health.warningsFound",
      context.t,
    );
  }

  const messageKey = HEALTH_MESSAGE_KEYS[check.message];
  return messageKey ? context.t(messageKey) : check.message;
}

export function localizeDiscoveryHealthCheck(
  check: SiteHealthCheck,
  context: DiscoveryHealthTranslationContext,
): SiteHealthCheck {
  const labelKey = HEALTH_LABEL_KEYS[check.id];
  return {
    ...check,
    label: labelKey ? context.t(labelKey) : check.label,
    message: localizeHealthMessage(check, context),
  };
}
