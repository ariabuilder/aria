import type { SiteSettings } from "../storage/adapter";
import { buildStudioPagePathMap } from "../pages/publicPaths";
import type { PageForDiscovery } from "../crawl/schemas";

export function buildOrganizationJsonLd(siteSettings: SiteSettings | null | undefined) {
  const siteUrl = siteSettings?.siteUrl?.trim();
  if (!siteUrl) {
    return null;
  }
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteSettings?.siteName ?? siteSettings?.seoTitle ?? "Site",
    url: siteUrl,
    logo: siteSettings?.ogImage || siteSettings?.favicon || undefined,
  };
}

export function buildWebSiteJsonLd(siteSettings: SiteSettings | null | undefined) {
  const siteUrl = siteSettings?.siteUrl?.trim();
  if (!siteUrl) {
    return null;
  }
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteSettings?.siteName ?? siteSettings?.seoTitle ?? "Site",
    url: siteUrl,
    description:
      siteSettings?.siteDescription ?? siteSettings?.seoDescription ?? undefined,
  };
}

export function buildBreadcrumbListJsonLd(input: {
  siteSettings: SiteSettings | null | undefined;
  page: Pick<PageForDiscovery, "slug">;
  pages: readonly Pick<PageForDiscovery, "slug" | "parent">[];
}) {
  const siteUrl = input.siteSettings?.siteUrl?.trim();
  if (!siteUrl || input.page.slug === "index") {
    return null;
  }

  const pathMap = buildStudioPagePathMap(
    input.pages.map((page) => ({ slug: page.slug, parent: page.parent })),
  );
  const publicPath = pathMap.get(input.page.slug) ?? `/${input.page.slug}`;
  const segments = publicPath.split("/").filter(Boolean);
  const items = [
    {
      "@type": "ListItem",
      position: 1,
      name: input.siteSettings?.siteName ?? "Home",
      item: siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`,
    },
  ];

  let currentPath = "";
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    items.push({
      "@type": "ListItem",
      position: index + 2,
      name: segment,
      item: `${siteUrl.replace(/\/+$/, "")}${currentPath}`,
    });
  });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

export function serializeJsonLd(value: Record<string, unknown> | null): string {
  if (!value) {
    return "";
  }
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
}

export function buildVerificationMetaTags(
  siteSettings: SiteSettings | null | undefined,
): string {
  const discovery = siteSettings?.discovery;
  const tags: string[] = [];
  if (discovery?.googleSiteVerification?.trim()) {
    tags.push(
      `<meta name="google-site-verification" content="${discovery.googleSiteVerification.trim()}" />`,
    );
  }
  if (discovery?.bingSiteVerification?.trim()) {
    tags.push(
      `<meta name="msvalidate.01" content="${discovery.bingSiteVerification.trim()}" />`,
    );
  }
  return tags.join("\n");
}
