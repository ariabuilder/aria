/**
 * Map Cloudflare clientRequestPath values to CMS page slugs.
 */

import {
  buildStudioPagePathMap,
  type PageForPublicPath,
} from "../pages/publicPaths";

export const UNMAPPED_TRAFFIC_KEY = "__unmapped__";

const EXCLUDED_PATH_PREFIXES = [
  "/admin",
  "/_astro",
  "/api",
  "/uploads",
] as const;

const STATIC_EXTENSION = /\.(css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|pdf|zip|xml|txt)$/i;

export function normalizeClientRequestPath(path: string): string {
  const withoutQuery = path.split("?")[0]?.split("#")[0] ?? path;
  let normalized = withoutQuery.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  normalized = normalized.replace(/\/{2,}/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized || "/";
}

export function shouldExcludeTrafficPath(path: string): boolean {
  const normalized = normalizeClientRequestPath(path);
  if (EXCLUDED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }
  return STATIC_EXTENSION.test(normalized);
}

export function buildPathToSlugMap(
  pages: readonly PageForPublicPath[],
): Map<string, string> {
  const slugToPath = buildStudioPagePathMap(pages);
  const pathToSlug = new Map<string, string>();

  for (const [slug, publicPath] of slugToPath) {
    const normalized = normalizeClientRequestPath(publicPath);
    const existing = pathToSlug.get(normalized);
    if (!existing) {
      pathToSlug.set(normalized, slug);
      continue;
    }
    pathToSlug.set(normalized, existing);
  }

  return pathToSlug;
}

export interface PathVisitRow {
  path: string;
  visits: number;
}

export interface SlugVisitAggregation {
  bySlug: Record<string, number>;
  unmappedVisits: number;
}

export function aggregateVisitsBySlug(
  rows: readonly PathVisitRow[],
  pages: readonly PageForPublicPath[],
): SlugVisitAggregation {
  const pathToSlug = buildPathToSlugMap(pages);
  const bySlug: Record<string, number> = {};
  let unmappedVisits = 0;

  for (const row of rows) {
    if (!row.visits || row.visits <= 0) {
      continue;
    }

    const normalized = normalizeClientRequestPath(row.path);
    if (shouldExcludeTrafficPath(normalized)) {
      continue;
    }

    const slug = pathToSlug.get(normalized);
    if (!slug) {
      unmappedVisits += row.visits;
      continue;
    }

    bySlug[slug] = (bySlug[slug] ?? 0) + row.visits;
  }

  return { bySlug, unmappedVisits };
}
