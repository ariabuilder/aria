export function parseSiteHostname(siteUrl?: string): string | null {
  if (!siteUrl?.trim()) {
    return null;
  }
  try {
    return new URL(siteUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function parseRequestHostname(requestHost: string): string {
  const trimmed = requestHost.trim().toLowerCase();
  const withoutPort = trimmed.split(":")[0] ?? trimmed;
  return withoutPort;
}

export function isStagingHost(
  requestHost: string,
  siteUrl?: string,
): boolean {
  const siteHostname = parseSiteHostname(siteUrl);
  if (!siteHostname) {
    return false;
  }
  const requestHostname = parseRequestHostname(requestHost);
  return requestHostname !== siteHostname;
}

export function stagingRobotsHeader(): { "X-Robots-Tag": string } {
  return { "X-Robots-Tag": "noindex, nofollow" };
}
