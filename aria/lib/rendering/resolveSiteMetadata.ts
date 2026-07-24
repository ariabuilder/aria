import type { SiteSettings } from "../storage/adapter";
import type { NodeToHtmlDocumentOptions } from "../blocks/nodesToHtml";

function pickFirstNonEmpty(
  ...values: Array<string | undefined | null>
): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function buildCanonicalFromSiteUrl(
  siteUrl: string | undefined,
  pathOrSlug: string | undefined,
): string | undefined {
  const normalizedBase = siteUrl?.trim().replace(/\/+$/, "");
  if (!normalizedBase) return undefined;

  const normalizedPath = pathOrSlug?.trim() || "/";
  if (normalizedPath === "/") {
    return normalizedBase;
  }

  const pathWithLeadingSlash = normalizedPath.startsWith("/")
    ? normalizedPath
    : `/${normalizedPath}`;

  return `${normalizedBase}${pathWithLeadingSlash}`;
}

export interface ResolvedSiteMetadata {
  title?: string;
  description?: string;
  seo: NodeToHtmlDocumentOptions["seo"];
  faviconHeadHTML: string;
}

export function resolveSiteMetadata(params: {
  siteSettings?: SiteSettings | null;
  pageTitle?: string;
  pageDescription?: string;
  pageSeo?: NodeToHtmlDocumentOptions["seo"];
  pathOrSlug?: string;
}): ResolvedSiteMetadata {
  const siteSettings = params.siteSettings;
  const pageSeo = params.pageSeo ?? {};

  const title = pickFirstNonEmpty(
    pageSeo.title,
    params.pageTitle,
    siteSettings?.seoTitle,
    siteSettings?.siteName,
  );

  const description = pickFirstNonEmpty(
    pageSeo.description,
    params.pageDescription,
    siteSettings?.seoDescription,
    siteSettings?.siteDescription,
  );

  const canonical = pickFirstNonEmpty(
    pageSeo.canonical,
    buildCanonicalFromSiteUrl(siteSettings?.siteUrl, params.pathOrSlug),
  );

  const ogImage = pickFirstNonEmpty(pageSeo.ogImage, siteSettings?.ogImage);

  const favicon = pickFirstNonEmpty(siteSettings?.favicon);
  const faviconHeadHTML = favicon ? `<link rel="icon" href="${favicon}">` : "";

  return {
    title,
    description,
    seo: {
      ...pageSeo,
      title: pickFirstNonEmpty(pageSeo.title),
      description: pickFirstNonEmpty(pageSeo.description),
      canonical,
      ogImage,
    },
    faviconHeadHTML,
  };
}
