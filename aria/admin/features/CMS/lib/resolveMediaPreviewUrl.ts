/**
 * Resolve a stored CMS media reference to a URL usable by the admin
 * preview. Media IDs normally come from the media library as a storage filename.
 */

export function resolveCmsMediaPreviewUrl(mediaId: string): string {
  const trimmed = mediaId.trim();
  if (!trimmed) {
    return "";
  }

  if (
    /^(?:https?:)?\/\//i.test(trimmed) ||
    /^(?:blob|data):/i.test(trimmed)
  ) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  return `/uploads/${trimmed.replace(/^uploads\//i, "")}`;
}
