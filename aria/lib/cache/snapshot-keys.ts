const CACHE_NAMESPACE = "aria:v1";

function sanitizeCachePart(value: string): string {
  return value
    .replace(/[<>'"&]/g, "")
    .replace(/\.\./g, "")
    .trim();
}

export function getSnapshotCacheKey(slug: string): string {
  return `${CACHE_NAMESPACE}:snapshot:${sanitizeCachePart(slug)}`;
}
