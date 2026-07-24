import type { SiteSettings } from "../storage/adapter";
import { normalizeBaseUrl } from "./normalizeBaseUrl";
import type {
  DiscoveryReportRow,
  SiteHealthCheck,
  SiteHealthSummary,
  SiteSeoAudit,
} from "./schemas";
import { DiscoverySettingsSchema, SiteHealthSummarySchema } from "./schemas";

export function buildSiteHealthChecks(input: {
  siteSettings: SiteSettings | null | undefined;
  rows: readonly DiscoveryReportRow[];
  audits: readonly SiteSeoAudit[];
}): SiteHealthSummary {
  const checks: SiteHealthCheck[] = [];
  const baseUrl = normalizeBaseUrl(input.siteSettings?.siteUrl);
  const discovery = DiscoverySettingsSchema.parse(input.siteSettings?.discovery ?? {});

  checks.push({
    id: "site-url",
    label: "Site URL configured",
    status: baseUrl ? "pass" : "error",
    message: baseUrl ? undefined : "Add a site URL in General settings.",
  });

  const indexableCount = input.rows.filter((row) => row.inSitemap).length;
  const indexabilityStatus =
    !baseUrl || discovery.discourageSearchEngines || discovery.sitemapMode === "off"
      ? "warning"
      : indexableCount > 0
        ? "pass"
        : "warning";
  const indexabilityMessage =
    !baseUrl
      ? "Sitemap generation needs a site URL."
      : discovery.discourageSearchEngines
        ? "Search engine visibility is discouraged, so sitemap entries are suppressed."
        : discovery.sitemapMode === "off"
          ? "sitemap.xml is turned off."
          : indexableCount > 0
            ? `${indexableCount} page(s) in sitemap`
            : "No pages are currently discoverable.";
  checks.push({
    id: "indexable-pages",
    label: "Indexable pages",
    status: indexabilityStatus,
    message: indexabilityMessage,
  });

  if (discovery.discourageSearchEngines) {
    checks.push({
      id: "discourage-search",
      label: "Search engine visibility",
      status: "warning",
      message: "Discourage search engines is enabled.",
    });
  }

  if (!discovery.discourageSearchEngines && discovery.llmsMode === "off") {
    checks.push({
      id: "llms-visibility",
      label: "AI discovery",
      status: "warning",
      message: "llms.txt is turned off.",
    });
  }

  const customDomain = input.siteSettings?.customDomain?.trim();
  if (customDomain && baseUrl) {
    try {
      const siteHost = new URL(baseUrl).hostname;
      const aligned = siteHost === customDomain.replace(/^https?:\/\//, "").split("/")[0];
      checks.push({
        id: "domain-alignment",
        label: "Domain alignment",
        status: aligned ? "pass" : "warning",
        message: aligned ? undefined : "Custom domain may not match site URL.",
      });
    } catch {
      checks.push({
        id: "domain-alignment",
        label: "Domain alignment",
        status: "warning",
        message: "Unable to validate custom domain alignment.",
      });
    }
  }

  const errorAudits = input.audits.filter((audit) => audit.severity === "error");
  const warningAudits = input.audits.filter(
    (audit) => audit.severity === "warning",
  );

  if (errorAudits.length > 0) {
    checks.push({
      id: "seo-errors",
      label: "SEO errors",
      status: "error",
      message: `${errorAudits.length} critical issue(s) found.`,
    });
  } else if (warningAudits.length > 0) {
    checks.push({
      id: "seo-warnings",
      label: "SEO warnings",
      status: "warning",
      message: `${warningAudits.length} warning(s) found.`,
    });
  }

  const passCount = checks.filter((check) => check.status === "pass").length;
  const score = Math.round((passCount / Math.max(checks.length, 1)) * 100);

  return SiteHealthSummarySchema.parse({ score, checks });
}
