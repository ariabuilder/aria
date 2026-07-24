/**
 * Lightweight check that the API token has Zone Analytics Read.
 */

import { metricsPeriodToIsoRange } from "../../metrics/period";
import {
  executeCloudflareGraphQL,
  isAnalyticsReadForbiddenError,
} from "./graphql";
import { ZONE_HTTP_TOTALS_QUERY } from "./queries";

const PROBE_GRANTED_TTL_MS = 5 * 60 * 1000;
const PROBE_DENIED_TTL_MS = 30 * 1000;
const probeCache = new Map<string, { at: number; granted: boolean }>();

function probeCacheTtl(granted: boolean): number {
  return granted ? PROBE_GRANTED_TTL_MS : PROBE_DENIED_TTL_MS;
}

export async function probeAnalyticsReadAccess(input: {
  apiToken: string;
  zoneId: string;
  siteHost: string;
}): Promise<{ granted: boolean; cached: boolean }> {
  const cacheKey = `${input.zoneId}:${input.siteHost}`;
  const cached = probeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < probeCacheTtl(cached.granted)) {
    return { granted: cached.granted, cached: true };
  }

  const { start, end } = metricsPeriodToIsoRange("24h");

  try {
    await executeCloudflareGraphQL({
      apiToken: input.apiToken,
      query: ZONE_HTTP_TOTALS_QUERY,
      variables: {
        zoneTag: input.zoneId,
        filter: {
          datetime_geq: start,
          datetime_lt: end,
          requestSource: "eyeball",
          clientRequestHTTPHost: input.siteHost,
        },
      },
    });
    probeCache.set(cacheKey, { at: Date.now(), granted: true });
    return { granted: true, cached: false };
  } catch (error) {
    const granted = !isAnalyticsReadForbiddenError(error);
    probeCache.set(cacheKey, { at: Date.now(), granted });
    return { granted, cached: false };
  }
}
