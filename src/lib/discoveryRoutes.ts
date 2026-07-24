import { getStorageAdapterAsync } from "../../aria/lib/storage/getStorageAdapter";
import {
  buildDiscoveryArtifacts,
  buildFeedXml,
  buildImageSitemapXml,
  buildLlmsFullTxt,
  buildSitemapChunkXml,
  loadDiscoveryContext,
} from "../../aria/lib/crawl";
import { resolveSiteStyleRevision } from "../../aria/lib/storage/adapter";

export const DISCOVERY_CACHE_CONTROL =
  "public, max-age=3600, stale-while-revalidate=86400";

type DiscoveryArtifactKind = "robots" | "sitemap" | "llms" | "feed" | "llms-full";
type DiscoveryCacheSiteSettings = Awaited<
  ReturnType<Awaited<ReturnType<typeof getStorageAdapterAsync>>["getSiteSettings"]>
>;

function contentTypeForKind(kind: DiscoveryArtifactKind): string {
  switch (kind) {
    case "sitemap":
    case "feed":
      return "application/xml; charset=utf-8";
    default:
      return "text/plain; charset=utf-8";
  }
}

function discoveryCacheHeaders(
  siteSettings: DiscoveryCacheSiteSettings,
  contentType: string,
): HeadersInit {
  const revision = resolveDiscoveryArtifactRevision(siteSettings);
  return {
    "Content-Type": contentType,
    "Cache-Control": DISCOVERY_CACHE_CONTROL,
    ETag: `"discovery-${revision}"`,
  };
}

export function resolveDiscoveryArtifactRevision(
  siteSettings: DiscoveryCacheSiteSettings,
): string {
  const styleRevision = resolveSiteStyleRevision(siteSettings ?? undefined);
  const updatedAt =
    typeof siteSettings?.updated_at === "number" &&
    Number.isFinite(siteSettings.updated_at)
      ? String(siteSettings.updated_at)
      : "0";
  return `${styleRevision}-${updatedAt}-${hashString(
    stableStringify(siteSettings?.discovery ?? {}),
  )}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export async function serveDiscoveryArtifact(
  locals: App.Locals,
  kind: DiscoveryArtifactKind,
): Promise<Response> {
  try {
    const adapter = await getStorageAdapterAsync(locals);
    const context = await loadDiscoveryContext(adapter);
    const artifacts = buildDiscoveryArtifacts(context);

    let body: string | null;
    switch (kind) {
      case "robots":
        body = artifacts.robots;
        break;
      case "sitemap":
        body = artifacts.sitemap;
        break;
      case "llms":
        body = artifacts.llms;
        break;
      case "feed":
        body = buildFeedXml(context);
        break;
      case "llms-full":
        body = buildLlmsFullTxt(context);
        break;
    }

    if (body === null || body.trim().length === 0) {
      if (kind === "sitemap") {
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n',
          {
            status: 200,
            headers: discoveryCacheHeaders(
              context.siteSettings,
              contentTypeForKind(kind),
            ),
          },
        );
      }
      return new Response("Not found", { status: 404 });
    }

    return new Response(body, {
      status: 200,
      headers: discoveryCacheHeaders(
        context.siteSettings,
        contentTypeForKind(kind),
      ),
    });
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function serveDiscoverySitemapChunk(
  locals: App.Locals,
  chunkNumber: number,
): Promise<Response> {
  try {
    const adapter = await getStorageAdapterAsync(locals);
    const context = await loadDiscoveryContext(adapter);
    const body = buildSitemapChunkXml({
      siteSettings: context.siteSettings,
      pages: context.pages,
      cmsEntries: context.cmsEntries,
      localizedPages: context.localizedPages,
      chunkNumber,
    });

    if (!body) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(body, {
      status: 200,
      headers: discoveryCacheHeaders(
        context.siteSettings,
        "application/xml; charset=utf-8",
      ),
    });
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function serveDiscoveryImageSitemap(
  locals: App.Locals,
): Promise<Response> {
  try {
    const adapter = await getStorageAdapterAsync(locals);
    const context = await loadDiscoveryContext(adapter);
    const body = buildImageSitemapXml(context);

    if (!body) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(body, {
      status: 200,
      headers: discoveryCacheHeaders(
        context.siteSettings,
        "application/xml; charset=utf-8",
      ),
    });
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
}
