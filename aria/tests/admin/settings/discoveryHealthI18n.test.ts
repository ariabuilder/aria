import { describe, expect, it } from "vitest";
import { getStudioMessage } from "../../../admin/i18n/messages";
import { localizeDiscoveryHealthCheck } from "../../../admin/features/Studio/settings/lib/discoveryHealthI18n";
import type {
  DiscoveryReportRow,
  SiteHealthCheck,
  SiteSeoAudit,
} from "../../../lib/crawl/schemas";

const t = (
  key: Parameters<typeof getStudioMessage>[1],
  values?: Parameters<typeof getStudioMessage>[2],
) => getStudioMessage("fr", key, values);

function localize(
  check: SiteHealthCheck,
  options: {
    rows?: DiscoveryReportRow[];
    audits?: SiteSeoAudit[];
  } = {},
): SiteHealthCheck {
  return localizeDiscoveryHealthCheck(check, {
    rows: options.rows ?? [],
    audits: options.audits ?? [],
    t,
  });
}

describe("localizeDiscoveryHealthCheck", () => {
  it("localizes known labels and static messages", () => {
    expect(
      localize({
        id: "site-url",
        label: "Site URL configured",
        status: "error",
        message: "Add a site URL in General settings.",
      }),
    ).toMatchObject({
      label: "URL du site configurée",
      message: "Ajoutez une URL de site dans les paramètres généraux.",
    });
  });

  it("localizes dynamic sitemap and warning counts", () => {
    const rows = Array.from({ length: 2 }, (_, index) => ({
      pageId: `page-${index}`,
      slug: `page-${index}`,
      title: `Page ${index}`,
      publicPath: `/page-${index}`,
      inSitemap: true,
      inLlms: true,
      canonicalOk: true,
      exclusionReason: "included" as const,
    }));
    const audits = Array.from({ length: 3 }, (_, index) => ({
      id: `warning-${index}`,
      severity: "warning" as const,
      message: `Warning ${index}`,
    }));

    expect(
      localize(
        {
          id: "indexable-pages",
          label: "Indexable pages",
          status: "pass",
          message: "2 page(s) in sitemap",
        },
        { rows },
      ),
    ).toMatchObject({
      label: "Pages indexables",
      message: "2 pages dans le plan du site",
    });
    expect(
      localize(
        {
          id: "seo-warnings",
          label: "SEO warnings",
          status: "warning",
          message: "3 warning(s) found.",
        },
        { audits },
      ),
    ).toMatchObject({
      label: "Avertissements SEO",
      message: "3 avertissements détectés.",
    });
  });

  it("preserves unknown report copy as a forward-compatible fallback", () => {
    expect(
      localize({
        id: "future-check",
        label: "Future check",
        status: "warning",
        message: "Future message",
      }),
    ).toMatchObject({ label: "Future check", message: "Future message" });
  });
});
