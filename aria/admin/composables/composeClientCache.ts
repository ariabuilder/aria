import type { ItemLoadingComposeResult } from "./itemLoadingActionResults";

/** Maximum age (ms) for a cached compose result before it's considered stale */
export const COMPOSE_CACHE_TTL_MS = 30_000;

interface CachedComposeEntry {
  readonly result: ItemLoadingComposeResult;
  readonly timestamp: number;
}

const composeCache = new Map<string, CachedComposeEntry>();
const inFlightComposeRequests = new Map<
  string,
  Promise<ItemLoadingComposeResult>
>();

export function composeCacheKey(itemType: string, slug: string): string {
  return `${itemType}:${slug}`;
}

export function getCachedCompose(
  itemType: string,
  slug: string,
): ItemLoadingComposeResult | null {
  const entry = composeCache.get(composeCacheKey(itemType, slug));
  if (!entry) return null;
  if (Date.now() - entry.timestamp > COMPOSE_CACHE_TTL_MS) {
    composeCache.delete(composeCacheKey(itemType, slug));
    return null;
  }
  return entry.result;
}

export function setCachedCompose(
  itemType: string,
  slug: string,
  result: ItemLoadingComposeResult,
): void {
  composeCache.set(composeCacheKey(itemType, slug), {
    result,
    timestamp: Date.now(),
  });
}

export function getInFlightComposeRequest(
  key: string,
): Promise<ItemLoadingComposeResult> | undefined {
  return inFlightComposeRequests.get(key);
}

export function setInFlightComposeRequest(
  key: string,
  request: Promise<ItemLoadingComposeResult>,
): void {
  inFlightComposeRequests.set(key, request);
}

export function deleteInFlightComposeRequest(key: string): void {
  inFlightComposeRequests.delete(key);
}

/** Invalidate a specific compose cache entry (e.g. after save) */
export function invalidateComposeCache(itemType: string, slug: string): void {
  composeCache.delete(composeCacheKey(itemType, slug));
}

export function clearComposeCache(): void {
  composeCache.clear();
  inFlightComposeRequests.clear();
}
