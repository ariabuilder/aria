import { resolveSiteMetadata } from "../rendering/resolveSiteMetadata";
import type { SiteSettings } from "../storage/adapter";
import { buildStudioPagePathMap } from "../pages/publicPaths";
import { normalizeBaseUrl } from "./normalizeBaseUrl";
import type { PageForDiscovery } from "./schemas";

function resolvePagePublicPath(input: {
  page: PageForDiscovery;
  pages: readonly PageForDiscovery[];
}): string {
  const pathMap = buildStudioPagePathMap(
    input.pages.map((page) => ({ slug: page.slug, parent: page.parent })),
  );
  return pathMap.get(input.page.slug) ?? "/";
}

/** The URL that belongs to this page's own canonical route. */
export function resolvePageSelfAbsoluteUrl(input: {
  siteUrl: string;
  page: PageForDiscovery;
  pages: readonly PageForDiscovery[];
}): string | undefined {
  const baseUrl = normalizeBaseUrl(input.siteUrl);
  if (!baseUrl) return undefined;
  const publicPath = resolvePagePublicPath(input);
  return publicPath === "/" ? `${baseUrl}/` : `${baseUrl}${publicPath}`;
}

/**
 * A non-self canonical is intentionally not eligible for automatic discovery
 * artifacts. Relative canonicals are compared after resolving against the
 * configured site origin.
 */
export function isPageSelfCanonical(input: {
  siteUrl: string;
  page: PageForDiscovery;
  pages: readonly PageForDiscovery[];
}): boolean {
  const self = resolvePageSelfAbsoluteUrl(input);
  if (!self) return false;
  const configured = input.page.settings?.seo?.canonical?.trim();
  if (!configured) return true;
  try {
    return new URL(configured, input.siteUrl).toString() === self;
  } catch {
    return false;
  }
}

export function resolvePageAbsoluteUrl(input: {
  siteUrl: string;
  page: PageForDiscovery;
  pages: readonly PageForDiscovery[];
  siteSettings?: SiteSettings | null;
}): string | undefined {
  const baseUrl = normalizeBaseUrl(input.siteUrl);
  if (!baseUrl) {
    return undefined;
  }

  const publicPath = resolvePagePublicPath(input);

  const resolved = resolveSiteMetadata({
    siteSettings: input.siteSettings,
    pageSeo: input.page.settings?.seo,
    pathOrSlug: publicPath,
  });

  const canonical = resolved.seo?.canonical?.trim();
  if (canonical) {
    try {
      return new URL(canonical, baseUrl).toString();
    } catch {
      return undefined;
    }
  }
  return resolvePageSelfAbsoluteUrl(input);
}
