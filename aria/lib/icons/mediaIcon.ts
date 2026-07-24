const ICON_MEDIA_URL_PATTERN = /^(?:https?:\/\/|\/)/i;

export function getIconMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || !ICON_MEDIA_URL_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}
