/**
 * Fetch and normalize Cloudflare zone traffic metrics.
 */

import { CloudflareGraphqlError, executeCloudflareGraphQL } from "../cloudflare/analytics/graphql";
import {
  ZONE_HTTP_BY_HOUR_QUERY,
  ZONE_HTTP_BY_PATH_QUERY,
  ZONE_HTTP_TOTALS_QUERY,
  type ZoneHourlyQueryResult,
  type ZonePathsQueryResult,
  type ZoneTotalsQueryResult,
} from "../cloudflare/analytics/queries";
import { resolveCloudflareAnalyticsCredentials } from "../cloudflare/analytics/credentials";
import type { RuntimeLocals } from "../cloudflare/env";
import type { PageForPublicPath } from "../pages/publicPaths";
import { aggregateVisitsBySlug } from "./pathMapping";
import {
  metricsPeriodToIsoRange,
  metricsPeriodToIsoRanges,
  splitIsoRange,
} from "./period";
import type { MetricsPeriod, TrafficRangeTotals } from "./types";

export const METRICS_CACHE_TTL_SECONDS = 900;

export interface ZoneSiteMetrics {
  period: MetricsPeriod;
  visits: number;
  requests: number;
  bandwidthBytes: number;
  fetchedAt: string;
  periodEnd: string;
  hourlyVisits: number[];
  hourlyRequests: number[];
  hourlyBandwidthBytes: number[];
  hourlyTimestamps: string[];
}

export interface ZonePagesMetrics {
  period: MetricsPeriod;
  bySlug: Record<string, number>;
  unmappedVisits: number;
  fetchedAt: string;
}

function buildZoneFilter(host: string, start: string, end: string) {
  return {
    datetime_geq: start,
    datetime_lt: end,
    requestSource: "eyeball",
    clientRequestHTTPHost: host,
  };
}

function parseSiteHost(siteUrl: string | undefined): string | undefined {
  if (!siteUrl?.trim()) {
    return undefined;
  }
  try {
    const host = new URL(
      siteUrl.includes("://") ? siteUrl : `https://${siteUrl}`,
    ).hostname;
    return host.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

export async function fetchZoneTrafficRange(input: {
  start: string;
  end: string;
  siteUrl: string | undefined;
  locals?: RuntimeLocals;
}): Promise<TrafficRangeTotals> {
  const { apiToken, zoneId } = resolveCloudflareAnalyticsCredentials(input.locals);
  if (!apiToken || !zoneId) {
    throw new CloudflareGraphqlError(
      "Missing Cloudflare analytics credentials",
      "graphql_error",
    );
  }

  const host = parseSiteHost(input.siteUrl);
  if (!host) {
    throw new CloudflareGraphqlError(
      "siteUrl is required for traffic metrics",
      "graphql_error",
    );
  }

  const chunks = await Promise.all(
    splitIsoRange(input.start, input.end).map(async ({ start, end }) => {
      const data = await executeCloudflareGraphQL<ZoneTotalsQueryResult>({
        apiToken,
        query: ZONE_HTTP_TOTALS_QUERY,
        variables: {
          zoneTag: zoneId,
          filter: buildZoneFilter(host, start, end),
        },
      });
      const totals = data.viewer?.zones?.[0]?.totals?.[0];
      return {
        visits: totals?.sum?.visits ?? 0,
        requests: totals?.count ?? 0,
        bandwidthBytes: totals?.sum?.edgeResponseBytes ?? 0,
      };
    }),
  );

  return chunks.reduce<TrafficRangeTotals>(
    (total, chunk) => ({
      ...total,
      visits: total.visits + chunk.visits,
      requests: total.requests + chunk.requests,
      bandwidthBytes: total.bandwidthBytes + chunk.bandwidthBytes,
    }),
    {
      start: input.start,
      end: input.end,
      visits: 0,
      requests: 0,
      bandwidthBytes: 0,
    },
  );
}

export async function fetchZoneSiteMetrics(input: {
  period: MetricsPeriod;
  siteUrl: string | undefined;
  locals?: RuntimeLocals;
}): Promise<ZoneSiteMetrics> {
  const { apiToken, zoneId } = resolveCloudflareAnalyticsCredentials(input.locals);
  if (!apiToken || !zoneId) {
    throw new CloudflareGraphqlError(
      "Missing Cloudflare analytics credentials",
      "graphql_error",
    );
  }

  const host = parseSiteHost(input.siteUrl);
  if (!host) {
    throw new CloudflareGraphqlError(
      "siteUrl is required for traffic metrics",
      "graphql_error",
    );
  }

  const ranges = metricsPeriodToIsoRanges(input.period);
  const { end } = metricsPeriodToIsoRange(input.period);
  const fetchedAt = new Date().toISOString();

  const chunkResults = await Promise.all(
    ranges.map(async ({ start, end: chunkEnd }) => {
      const filter = buildZoneFilter(host, start, chunkEnd);
      const [totalsData, hourlyData] = await Promise.all([
        executeCloudflareGraphQL<ZoneTotalsQueryResult>({
          apiToken,
          query: ZONE_HTTP_TOTALS_QUERY,
          variables: { zoneTag: zoneId, filter },
        }),
        executeCloudflareGraphQL<ZoneHourlyQueryResult>({
          apiToken,
          query: ZONE_HTTP_BY_HOUR_QUERY,
          variables: { zoneTag: zoneId, filter },
        }),
      ]);

      const totalsGroup = totalsData.viewer?.zones?.[0]?.totals?.[0];
      const hourlyGroups = hourlyData.viewer?.zones?.[0]?.series ?? [];
      const hourlyRows = hourlyGroups
        .map((group) => ({
          hour: group.dimensions?.datetimeHour ?? "",
          visits: group.sum?.visits ?? 0,
          requests: group.count ?? 0,
          bandwidthBytes: group.sum?.edgeResponseBytes ?? 0,
        }))
        .filter((row) => row.hour);

      return {
        visits: totalsGroup?.sum?.visits ?? 0,
        requests: totalsGroup?.count ?? 0,
        bandwidthBytes: totalsGroup?.sum?.edgeResponseBytes ?? 0,
        hourlyRows,
      };
    }),
  );

  let visits = 0;
  let requests = 0;
  let bandwidthBytes = 0;
  const hourlyByHour = new Map<
    string,
    { visits: number; requests: number; bandwidthBytes: number }
  >();

  for (const chunk of chunkResults) {
    visits += chunk.visits;
    requests += chunk.requests;
    bandwidthBytes += chunk.bandwidthBytes;
    for (const row of chunk.hourlyRows) {
      const current = hourlyByHour.get(row.hour) ?? {
        visits: 0,
        requests: 0,
        bandwidthBytes: 0,
      };
      hourlyByHour.set(row.hour, {
        visits: current.visits + row.visits,
        requests: current.requests + row.requests,
        bandwidthBytes: current.bandwidthBytes + row.bandwidthBytes,
      });
    }
  }

  const hourlySeries = [...hourlyByHour.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const hourlyTimestamps = hourlySeries.map(([timestamp]) => timestamp);
  const hourlyVisits = hourlySeries.map(([, point]) => point.visits);
  const hourlyRequests = hourlySeries.map(([, point]) => point.requests);
  const hourlyBandwidthBytes = hourlySeries.map(
    ([, point]) => point.bandwidthBytes,
  );

  return {
    period: input.period,
    visits,
    requests,
    bandwidthBytes,
    fetchedAt,
    periodEnd: end,
    hourlyVisits,
    hourlyRequests,
    hourlyBandwidthBytes,
    hourlyTimestamps,
  };
}

export async function fetchZonePagesMetrics(input: {
  period: MetricsPeriod;
  siteUrl: string | undefined;
  pages: readonly PageForPublicPath[];
  locals?: RuntimeLocals;
}): Promise<ZonePagesMetrics> {
  const { apiToken, zoneId } = resolveCloudflareAnalyticsCredentials(input.locals);
  if (!apiToken || !zoneId) {
    throw new CloudflareGraphqlError(
      "Missing Cloudflare analytics credentials",
      "graphql_error",
    );
  }

  const host = parseSiteHost(input.siteUrl);
  if (!host) {
    throw new CloudflareGraphqlError(
      "siteUrl is required for traffic metrics",
      "graphql_error",
    );
  }

  const ranges = metricsPeriodToIsoRanges(input.period);
  const fetchedAt = new Date().toISOString();
  const visitsByPath = new Map<string, number>();

  await Promise.all(
    ranges.map(async ({ start, end }) => {
      const filter = buildZoneFilter(host, start, end);
      const pathsData = await executeCloudflareGraphQL<ZonePathsQueryResult>({
        apiToken,
        query: ZONE_HTTP_BY_PATH_QUERY,
        variables: { zoneTag: zoneId, filter },
      });

      const pathGroups = pathsData.viewer?.zones?.[0]?.paths ?? [];
      for (const group of pathGroups) {
        const path = group.dimensions?.clientRequestPath ?? "";
        if (!path) {
          continue;
        }
        const chunkVisits = group.sum?.visits ?? 0;
        visitsByPath.set(path, (visitsByPath.get(path) ?? 0) + chunkVisits);
      }
    }),
  );

  const rows = [...visitsByPath.entries()].map(([path, pathVisits]) => ({
    path,
    visits: pathVisits,
  }));

  const { bySlug, unmappedVisits } = aggregateVisitsBySlug(rows, input.pages);

  return {
    period: input.period,
    bySlug,
    unmappedVisits,
    fetchedAt,
  };
}

export { CloudflareGraphqlError };
