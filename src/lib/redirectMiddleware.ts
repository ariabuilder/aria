import { getStorageAdapterAsync } from "../../aria/lib/storage/getStorageAdapter";
import {
  DiscoverySettingsSchema,
  type TrailingSlashPolicy,
} from "../../aria/lib/crawl/schemas";
import {
  normalizeTrailingSlashPath,
  resolveRedirectTarget,
  resolveTrailingSlashPolicy,
} from "../../aria/lib/redirects/normalizePath";
import { listRedirectsFromAdapter } from "../../aria/lib/redirects/storage";

const SKIP_PREFIXES = [
  "/admin",
  "/_actions",
  "/api/",
  "/uploads",
  "/_astro",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/feed.xml",
  "/sitemap-images.xml",
  "/favicon.ico",
  "/styles/",
] as const;

export function shouldSkipRedirectLookup(pathname: string): boolean {
  if (pathname === "/") {
    return false;
  }
  if (pathname === "/api") {
    return true;
  }
  if (/^\/sitemap-\d+\.xml$/u.test(pathname)) {
    return true;
  }
  return SKIP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

export async function resolvePublicRedirect(
  locals: App.Locals,
  requestUrl: URL,
): Promise<Response | null> {
  if (shouldSkipRedirectLookup(requestUrl.pathname)) {
    return null;
  }

  const adapter = await getStorageAdapterAsync(locals);
  const siteSettings = await adapter.getSiteSettings();
  const discovery = DiscoverySettingsSchema.parse(siteSettings?.discovery ?? {});
  const slashPolicy = resolveTrailingSlashPolicy(
    discovery.trailingSlashPolicy as TrailingSlashPolicy | undefined,
  );
  const normalizedSlash = normalizeTrailingSlashPath(
    requestUrl.pathname,
    slashPolicy,
  );
  if (normalizedSlash && normalizedSlash !== requestUrl.pathname) {
    const target = new URL(requestUrl.toString());
    target.pathname = normalizedSlash;
    return Response.redirect(target.toString(), 301);
  }

  const rules = await listRedirectsFromAdapter(adapter, {
    includeDisabled: false,
  });
  const match = resolveRedirectTarget(rules, requestUrl.pathname);
  if (!match) {
    return null;
  }

  const destination = new URL(match.toPath, requestUrl.origin).toString();

  return Response.redirect(destination, match.statusCode);
}
