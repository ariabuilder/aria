import type { SiteSettings } from "../storage/adapter";
import { isPageDiscoverable } from "./discoverability";
import { normalizeBaseUrl } from "./normalizeBaseUrl";
import { isPageSelfCanonical, resolvePageAbsoluteUrl } from "./resolvePageLoc";
import { DiscoverySettingsSchema, type PageForDiscovery } from "./schemas";

export function buildLlmsFullTxt(input: {
  siteSettings: SiteSettings | null | undefined;
  pages: readonly PageForDiscovery[];
}): string | null {
  const discovery = DiscoverySettingsSchema.parse(
    input.siteSettings?.discovery ?? {},
  );

  if (discovery.llmsMode === "off" || discovery.discourageSearchEngines) {
    return null;
  }

  const baseUrl = normalizeBaseUrl(input.siteSettings?.siteUrl);
  const siteName = input.siteSettings?.siteName?.trim() || "Site";
  const siteDescription =
    input.siteSettings?.siteDescription?.trim() ||
    input.siteSettings?.seoDescription?.trim() ||
    "";

  const lines: string[] = [`# ${siteName}`];
  if (siteDescription) {
    lines.push(`> ${siteDescription}`);
  }
  if (discovery.llmsAiPolicy?.trim()) {
    lines.push("", discovery.llmsAiPolicy.trim());
  }
  if (baseUrl) {
    lines.push("", baseUrl, `${baseUrl}/llms.txt`);
  }

  const discoverable = input.pages.filter(
    (page) =>
      isPageDiscoverable(page) &&
      Boolean(baseUrl) &&
      isPageSelfCanonical({ siteUrl: baseUrl!, page, pages: input.pages }),
  );
  if (discoverable.length > 0) {
    lines.push("", "## Pages");
    for (const page of discoverable) {
      const title = page.title?.trim() || page.slug || "Page";
      const url =
        baseUrl &&
        resolvePageAbsoluteUrl({
          siteUrl: baseUrl,
          page,
          pages: input.pages,
          siteSettings: input.siteSettings,
        });
      const description =
        page.description?.trim() ||
        page.settings?.seo?.description?.trim() ||
        "";
      const seoTitle = page.settings?.seo?.title?.trim();
      if (url) {
        lines.push("", `### ${title}`);
        lines.push(`URL: ${url}`);
        if (seoTitle && seoTitle !== title) {
          lines.push(`SEO title: ${seoTitle}`);
        }
        if (description) {
          lines.push(`Summary: ${description}`);
        }
      }
    }
  }

  return `${lines.join("\n")}\n`;
}
