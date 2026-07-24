import type { SiteSettings } from "../storage/adapter";
import { isPageDiscoverable } from "./discoverability";
import { normalizeBaseUrl } from "./normalizeBaseUrl";
import { isPageSelfCanonical, resolvePageAbsoluteUrl } from "./resolvePageLoc";
import {
  DiscoverySettingsSchema,
  type DiscoverySettings,
  type PageForDiscovery,
} from "./schemas";

function resolveDiscoverySettings(
  siteSettings: SiteSettings | null | undefined,
): DiscoverySettings {
  return DiscoverySettingsSchema.parse(siteSettings?.discovery ?? {});
}

export function buildLlmsTxt(input: {
  siteSettings: SiteSettings | null | undefined;
  pages: readonly PageForDiscovery[];
}): string | null {
  const discovery = resolveDiscoverySettings(input.siteSettings);

  if (discovery.llmsMode === "off" || discovery.discourageSearchEngines) {
    return null;
  }

  if (discovery.llmsMode === "custom" && discovery.llmsCustom?.trim()) {
    return discovery.llmsCustom.trim();
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
  if (baseUrl) {
    lines.push("", baseUrl, `${baseUrl}/llms-full.txt`);
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
        page.description?.trim() || page.settings?.seo?.description?.trim();
      if (url) {
        lines.push(
          description
            ? `- [${title}](${url}): ${description}`
            : `- [${title}](${url})`,
        );
      }
    }
  }

  return `${lines.join("\n")}\n`;
}
