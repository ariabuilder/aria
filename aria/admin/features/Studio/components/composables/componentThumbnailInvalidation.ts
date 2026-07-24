const staleComponentThumbnailIds = new Set<string>();

export function markComponentThumbnailStale(componentId: string): void {
  const normalized = componentId.trim();
  if (!normalized) {
    return;
  }
  staleComponentThumbnailIds.add(normalized);
}

export function consumeStaleComponentThumbnailIds(): string[] {
  const ids = [...staleComponentThumbnailIds];
  staleComponentThumbnailIds.clear();
  return ids;
}

export function isComponentThumbnailStale(componentId: string): boolean {
  return staleComponentThumbnailIds.has(componentId.trim());
}

export function clearComponentThumbnailStale(componentId: string): void {
  staleComponentThumbnailIds.delete(componentId.trim());
}

/** Test-only reset */
export function clearStaleComponentThumbnailIds(): void {
  staleComponentThumbnailIds.clear();
}
