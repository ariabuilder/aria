/**
 * Serve /uploads/* from the bound R2 bucket. This is the media delivery path
 * whenever no public R2 CDN URL (R2_PUBLIC_URL) is configured — always the
 * case for one-click deploys, and for local dev:edge where Miniflare stores
 * objects locally.
 */

type R2ObjectBodyLike = {
  body: ReadableStream | null;
  etag?: string;
  httpEtag?: string;
  uploaded?: Date;
  httpMetadata?: { contentType?: string };
  writeHttpMetadata?: (headers: Headers) => void;
};

type R2BucketLike = {
  get(key: string): Promise<R2ObjectBodyLike | null>;
};

// Dev responses stay private so shared caches never pin local content;
// production media is public site content and safe to cache at the edge.
const UPLOADS_CACHE_CONTROL = import.meta.env.DEV
  ? "private, max-age=3600, stale-while-revalidate=86400"
  : "public, max-age=3600, stale-while-revalidate=86400";

function normalizeHttpEtag(object: R2ObjectBodyLike): string | null {
  if (object.httpEtag) {
    return object.httpEtag;
  }

  if (!object.etag) {
    return null;
  }

  return object.etag.startsWith('"') ? object.etag : `"${object.etag}"`;
}

function requestMatchesEtag(headers: Headers | undefined, etag: string): boolean {
  const value = headers?.get("if-none-match");
  if (!value) {
    return false;
  }

  return value
    .split(",")
    .map((candidate) => candidate.trim())
    .includes(etag);
}

function requestMatchesLastModified(
  headers: Headers | undefined,
  uploaded?: Date,
): boolean {
  if (!uploaded) {
    return false;
  }

  const value = headers?.get("if-modified-since");
  if (!value) {
    return false;
  }

  const since = new Date(value).getTime();
  if (Number.isNaN(since)) {
    return false;
  }

  return uploaded.getTime() <= since;
}

export function resolveUploadsR2ObjectKey(pathname: string): string | null {
  const uploadsPrefix = "/uploads/";
  if (!pathname.startsWith(uploadsPrefix)) {
    return null;
  }

  const objectKey = pathname.slice(uploadsPrefix.length);
  if (!objectKey || objectKey.endsWith("/")) {
    return null;
  }

  return objectKey;
}

export async function serveUploadsFromR2Binding(input: {
  requestUrl: string;
  requestHeaders?: Headers;
  bucket?: R2BucketLike;
}): Promise<Response | null> {
  const requestUrl = new URL(input.requestUrl);
  const objectKey = resolveUploadsR2ObjectKey(requestUrl.pathname);
  if (!objectKey || !input.bucket) {
    return null;
  }

  const object = await input.bucket.get(objectKey);
  if (!object?.body) {
    return null;
  }

  const headers = new Headers();
  if (typeof object.writeHttpMetadata === "function") {
    object.writeHttpMetadata(headers);
  } else {
    const contentType = object.httpMetadata?.contentType;
    if (contentType) {
      headers.set("Content-Type", contentType);
    }
  }

  const etag = normalizeHttpEtag(object);
  if (etag) {
    headers.set("ETag", etag);
  }

  if (object.uploaded) {
    headers.set("Last-Modified", object.uploaded.toUTCString());
  }

  headers.set("Cache-Control", UPLOADS_CACHE_CONTROL);

  if (
    (etag && requestMatchesEtag(input.requestHeaders, etag)) ||
    (!etag && requestMatchesLastModified(input.requestHeaders, object.uploaded))
  ) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(object.body, { status: 200, headers });
}
