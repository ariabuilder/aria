/**
 * Validate Cloudflare zone ID matches siteUrl hostname (Zone Read API).
 */

import { log as baseLog } from "../../utils/logger";

type ZoneApiResponse = {
  success?: boolean;
  result?: {
    id?: string;
    name?: string;
    status?: string;
  };
  errors?: Array<{ message?: string; code?: number }>;
};

export type ZoneHostCheckResult = {
  checked: boolean;
  hostMismatch: boolean;
  zoneName?: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const zoneCheckCache = new Map<string, { at: number; result: ZoneHostCheckResult }>();

/** Compare site host to zone apex (handles www). */
export function hostsAlignWithZone(siteHost: string, zoneName: string): boolean {
  const normalize = (host: string) => host.trim().toLowerCase().replace(/^www\./, "");
  const site = normalize(siteHost);
  const zone = normalize(zoneName);
  if (!site || !zone) {
    return false;
  }
  return site === zone || site.endsWith(`.${zone}`);
}

export async function checkZoneHostAlignment(input: {
  apiToken: string;
  zoneId: string;
  siteHost: string | undefined;
}): Promise<ZoneHostCheckResult> {
  const siteHost = input.siteHost?.trim().toLowerCase();
  if (!siteHost) {
    return { checked: false, hostMismatch: false };
  }

  const cacheKey = `${input.zoneId}:${siteHost}`;
  const cached = zoneCheckCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.result;
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(input.zoneId)}`,
      {
        headers: {
          Authorization: `Bearer ${input.apiToken}`,
          Accept: "application/json",
        },
      },
    );

    if (response.status === 403 || response.status === 401) {
      baseLog("info", "[Zone validation] skipped — token lacks Zone Read", {
        status: response.status,
      });
      const result: ZoneHostCheckResult = { checked: false, hostMismatch: false };
      zoneCheckCache.set(cacheKey, { at: Date.now(), result });
      return result;
    }

    if (!response.ok) {
      baseLog("warn", "[Zone validation] zone lookup failed", {
        status: response.status,
      });
      return { checked: false, hostMismatch: false };
    }

    const body = (await response.json()) as ZoneApiResponse;
    const zoneName = body.result?.name?.trim();
    if (!zoneName) {
      return { checked: false, hostMismatch: false };
    }

    const hostMismatch = !hostsAlignWithZone(siteHost, zoneName);
    const result: ZoneHostCheckResult = {
      checked: true,
      hostMismatch,
      zoneName,
    };
    zoneCheckCache.set(cacheKey, { at: Date.now(), result });
    return result;
  } catch (error) {
    baseLog("warn", "[Zone validation] request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { checked: false, hostMismatch: false };
  }
}
