import type { SiteSettings } from "../storage/adapter";
import { isPageDiscoverable } from "./discoverability";
import type { PageForDiscovery, SiteSeoAudit } from "./schemas";

function normalizeMeta(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function runSiteSeoAudits(
  pages: readonly PageForDiscovery[],
  siteSettings: SiteSettings | null | undefined,
): SiteSeoAudit[] {
  const audits: SiteSeoAudit[] = [];
  const publishedPublic = pages.filter(
    (page) => page.status === "published" && page.accessMode === "public",
  );

  const titleMap = new Map<string, string[]>();
  const descriptionMap = new Map<string, string[]>();

  for (const page of publishedPublic) {
    const title = normalizeMeta(
      page.settings?.seo?.title ?? page.title ?? siteSettings?.seoTitle,
    );
    const description = normalizeMeta(
      page.settings?.seo?.description ??
        page.description ??
        siteSettings?.seoDescription,
    );

    if (title) {
      const ids = titleMap.get(title) ?? [];
      ids.push(page.id);
      titleMap.set(title, ids);
    } else {
      audits.push({
        id: `missing-title-${page.id}`,
        severity: "warning",
        message: "Published public page is missing a meta title.",
        pageIds: [page.id],
      });
    }

    if (description) {
      const ids = descriptionMap.get(description) ?? [];
      ids.push(page.id);
      descriptionMap.set(description, ids);
    } else if (isPageDiscoverable(page)) {
      audits.push({
        id: `missing-description-${page.id}`,
        severity: "warning",
        message: "Discoverable page is missing a meta description.",
        pageIds: [page.id],
      });
    }

    const structuredData = page.settings?.seo?.structuredData;
    if (structuredData && typeof structuredData["@type"] !== "string") {
      audits.push({
        id: `invalid-jsonld-${page.id}`,
        severity: "warning",
        message: "Page structured data is missing a valid @type.",
        pageIds: [page.id],
      });
    }
  }

  for (const [title, pageIds] of titleMap.entries()) {
    if (pageIds.length > 1) {
      audits.push({
        id: `duplicate-title-${title.slice(0, 24)}`,
        severity: "warning",
        message: `Duplicate meta title: "${title.slice(0, 80)}"`,
        pageIds,
      });
    }
  }

  for (const [description, pageIds] of descriptionMap.entries()) {
    if (pageIds.length > 1) {
      audits.push({
        id: `duplicate-description-${description.slice(0, 24)}`,
        severity: "warning",
        message: "Duplicate meta description across multiple pages.",
        pageIds,
      });
    }
  }

  if (!siteSettings?.siteUrl?.trim()) {
    audits.push({
      id: "missing-site-url",
      severity: "error",
      message: "Site URL is not configured.",
    });
  }

  const notFoundPages = pages.filter(
    (page) =>
      page.systemRole === "not-found" &&
      page.status === "published" &&
      page.accessMode === "public",
  );
  if (notFoundPages.length > 0) {
    audits.push({
      id: "404-redirect-suggest",
      severity: "warning",
      message: `${notFoundPages.length} published 404 page(s) may need redirect rules.`,
      pageIds: notFoundPages.map((page) => page.id),
    });
  }

  const discoverablePages = publishedPublic.filter(isPageDiscoverable);
  const linkedTargets = new Set<string>(["/"]);
  for (const page of discoverablePages) {
    if (page.slug !== "index" && page.parent) {
      linkedTargets.add(page.parent);
    }
  }
  const orphanPages = discoverablePages.filter(
    (page) => page.slug !== "index" && !linkedTargets.has(page.slug),
  );
  if (orphanPages.length > 0) {
    audits.push({
      id: "orphan-pages",
      severity: "warning",
      message: `${orphanPages.length} discoverable page(s) are not linked from navigation hierarchy.`,
      pageIds: orphanPages.map((page) => page.id),
    });
  }

  return audits;
}
