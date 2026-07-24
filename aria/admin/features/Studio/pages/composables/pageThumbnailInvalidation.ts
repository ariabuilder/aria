/**
 * Tracks page ids whose stored grid thumbnails are out of date
 * after a save. Consumed when PagesView re-activates (KeepAlive) to trigger regeneration.
 */

const stalePageThumbnailIds = new Set<string>();

export function markPageThumbnailStale(pageId: string): void {
  const trimmed = pageId.trim();
  if (!trimmed) {
    return;
  }
  stalePageThumbnailIds.add(trimmed);
}

export function consumeStalePageThumbnailIds(): string[] {
  const ids = [...stalePageThumbnailIds];
  stalePageThumbnailIds.clear();
  return ids;
}

export function isPageThumbnailStale(pageId: string): boolean {
  return stalePageThumbnailIds.has(pageId.trim());
}

export function clearPageThumbnailStale(pageId: string): void {
  stalePageThumbnailIds.delete(pageId.trim());
}

/** Test-only reset */
export function clearStalePageThumbnailIds(): void {
  stalePageThumbnailIds.clear();
}
