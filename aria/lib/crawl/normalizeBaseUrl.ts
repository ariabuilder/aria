export function normalizeBaseUrl(siteUrl?: string): string | null {
  if (!siteUrl || siteUrl.trim().length === 0) {
    return null;
  }

  try {
    const parsed = new URL(siteUrl);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
