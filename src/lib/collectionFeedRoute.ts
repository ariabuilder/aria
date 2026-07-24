import type { APIContext } from "astro";
import { buildLocalizedCollectionFeedXml } from "../../aria/lib/crawl/buildFeedXml";
import { loadLocalizedCollectionFeed } from "../../aria/lib/crawl/loadLocalizedCollectionFeed";
import { normalizeContentLocalization } from "../../aria/lib/localization/contentLocale";
import { getStorageAdapterAsync } from "../../aria/lib/storage/getStorageAdapter";

function validator(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `"${(hash >>> 0).toString(16)}"`;
}

export async function serveCollectionFeed(
  context: APIContext,
  input: { collection: string; locale?: string },
): Promise<Response> {
  const adapter = await getStorageAdapterAsync(context.locals);
  const settings = await adapter.getSiteSettings();
  const localization = normalizeContentLocalization(settings?.localization?.content);
  const locale = input.locale ?? localization.defaultLocale;
  const feed = await loadLocalizedCollectionFeed({
    adapter,
    collectionIdOrName: input.collection,
    locale,
    localization,
  });
  // Deliberately indistinguishable: disabled, missing, non-routable, and empty
  // collection configuration never reveal internal collection state.
  if (!feed) return new Response("Not found", { status: 404 });
  const xml = buildLocalizedCollectionFeedXml(feed);
  const etag = validator(xml);
  if (context.request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      etag,
      "last-modified": new Date(feed.updatedAt).toUTCString(),
    },
  });
}
