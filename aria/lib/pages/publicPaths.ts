/**
 * Canonical public URL paths for CMS pages (nested parents, index →
 * /). Used for Studio previews, traffic attribution, and list display paths.
 */

export interface PageForPublicPath {
  slug: string;
  parent?: string | null;
}

export function buildStudioPagePathMap(
  pages: readonly PageForPublicPath[],
): ReadonlyMap<string, string> {
  const pageBySlug = new Map<string, PageForPublicPath>(
    pages.map((page) => [page.slug, page] as const),
  );
  const resolvedPaths = new Map<string, string>();
  const resolving = new Set<string>();

  const resolvePath = (slug: string): string | null => {
    const cachedPath = resolvedPaths.get(slug);
    if (cachedPath) {
      return cachedPath;
    }

    const page = pageBySlug.get(slug);
    if (!page) {
      return null;
    }

    if (page.slug === "index") {
      resolvedPaths.set(page.slug, "/");
      return "/";
    }

    if (resolving.has(slug)) {
      return `/${page.slug}`;
    }

    resolving.add(slug);

    const parentPath = page.parent ? resolvePath(page.parent) : null;
    const pagePath =
      parentPath && parentPath !== "/"
        ? `${parentPath}/${page.slug}`
        : `/${page.slug}`;

    resolving.delete(slug);
    resolvedPaths.set(page.slug, pagePath);
    return pagePath;
  };

  for (const page of pages) {
    resolvedPaths.set(page.slug, resolvePath(page.slug) ?? `/${page.slug}`);
  }

  return resolvedPaths;
}

/** Resolve one page's public path using the same rules as {@link buildStudioPagePathMap}. */
export function resolvePublicPagePath(
  pageSlug: string,
  pages: readonly PageForPublicPath[],
): string {
  return buildStudioPagePathMap(pages).get(pageSlug) ?? `/${pageSlug}`;
}

/** Resolve a site-relative path or URL to an absolute URL when siteUrl is known. */
export function resolveAbsoluteSiteUrl(
  siteUrl: string | undefined,
  pathOrUrl: string | undefined,
): string | undefined {
  const trimmed = pathOrUrl?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const base = siteUrl?.trim().replace(/\/+$/, "");
  if (!base) return trimmed;

  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}
