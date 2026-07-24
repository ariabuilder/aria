/**
 * Aria Studio Thumbnails Service Worker
 *
 * Caches successful responses from `/admin/api/page-thumbnails/*` and
 * `/admin/api/component-thumbnails/*` so Studio grids can render thumbnails
 * from disk on revisit even after the HTTP `max-age` expires or the user
 * re-opens Aria in a new session.
 *
 * The admin URLs are content-addressed (they embed `page.updatedAt` + the
 * site `styleRevision` via `buildPageThumbnailAdminUrl`), so a cache-first
 * strategy is safe: changing the underlying thumbnail bumps the URL, the
 * old entry becomes unreachable and naturally LRU-evicts.
 *
 * Scope: `/admin/` — registered from `aria/admin/main.ts`.
 */

const CACHE_NAME = "aria-thumbnails-v3";
const LEGACY_CACHE_PREFIX = "aria-page-thumbnails-";
const THUMBNAIL_PATH_PREFIXES = [
  "/admin/api/page-thumbnails/",
  "/admin/api/component-thumbnails/",
];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any previous cache versions so a SW upgrade doesn't pile up
      // stale thumbnail bytes from the old release.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              (name.startsWith(LEGACY_CACHE_PREFIX) ||
                name.startsWith("aria-thumbnails-")) &&
              name !== CACHE_NAME,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (!THUMBNAIL_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;
  if (url.searchParams.has("cv")) return;

  event.respondWith(handleThumbnailRequest(request));
});

async function handleThumbnailRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    // Network failure with no cached fallback — surface the error to the
    // client so the existing thumbnail-generation fallback kicks in.
    throw error;
  }

  const cacheControl = response.headers.get("cache-control") || "";
  if (response.ok && /\bimmutable\b/i.test(cacheControl)) {
    // Clone before caching — Response bodies can only be read once.
    cache.put(request, response.clone()).catch(() => {
      /* cache write failures are non-fatal */
    });
  }

  return response;
}
