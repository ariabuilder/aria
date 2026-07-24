/**
 * Shared slug normalization for editor routing, compose, and session restore.
 */

const NORMALIZED_INDEX_SLUG = "index" as const;

export function normalizeEditorSlug(slug: string): string {
  return slug === "/" || slug === "index" ? NORMALIZED_INDEX_SLUG : slug;
}

export function editorSlugsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null || b == null || a.length === 0 || b.length === 0) {
    return false;
  }
  return normalizeEditorSlug(a) === normalizeEditorSlug(b);
}
