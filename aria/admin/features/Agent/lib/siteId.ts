import type { SiteSettings } from "../../../../lib/storage/adapter";

export function resolveSiteId(input: {
  siteSettings: SiteSettings | null | undefined;
  request: Request;
}): string {
  const fromSettings = input.siteSettings?.siteUrl?.trim();
  if (fromSettings) {
    try {
      return new URL(fromSettings).hostname;
    } catch {
      return fromSettings.replace(/^https?:\/\//u, "").split("/")[0] ?? "default";
    }
  }

  const host = input.request.headers.get("host")?.trim();
  if (host) {
    return host.split(":")[0] ?? "default";
  }

  return "default";
}

export function resolveAgentDoName(input: {
  siteId: string;
  userId: string;
}): string {
  return `${input.siteId}:${input.userId}`;
}
