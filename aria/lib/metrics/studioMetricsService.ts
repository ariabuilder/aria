/**
 * Server-side Studio metrics fetch with KV cache and in-flight dedupe.
 */

import type { ActionAPIContext } from "astro:actions";
import {
  getCachedJson,
  setCachedJson,
  type CacheContext,
} from "../cache/service";
import type { StorageAdapter } from "../storage/adapter";
import type { PageForPublicPath } from "../pages/publicPaths";
import { isAnalyticsReadForbiddenError } from "../cloudflare/analytics/graphql";
import {
  CloudflareGraphqlError,
  fetchZonePagesMetrics,
  fetchZoneSiteMetrics,
  fetchZoneTrafficRange,
  METRICS_CACHE_TTL_SECONDS,
  type ZonePagesMetrics,
  type ZoneSiteMetrics,
} from "./cloudflareZoneMetrics";
import { dedupeInFlight } from "./inFlight";
import type { MetricsPeriod } from "./types";
import { resolveCloudflareAnalyticsCredentials } from "../cloudflare/analytics/credentials";
import type { TrafficSummary } from "./types";
import {
  buildTrafficSummary,
  buildTrafficSummaryRanges,
} from "./trafficSummary";

const FORCE_REFRESH_COOLDOWN_MS = 60_000;
const lastForceRefreshByUser = new Map<string, number>();

type ActionContextLike = CacheContext & Pick<ActionAPIContext, "locals">;

function metricsCacheKey(
  kind: "site" | "paths",
  zoneId: string,
  host: string,
  period: MetricsPeriod,
): string {
  return `metrics:cf:${kind}:${zoneId}:${host}:${period}`;
}

function trafficSummaryCacheKey(
  zoneId: string,
  host: string,
  timeZone: string,
  currentStart: string,
): string {
  return [
    "metrics:cf:summary",
    zoneId,
    host,
    encodeURIComponent(timeZone),
    currentStart,
  ].join(":");
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

function canForceRefresh(userId: string): boolean {
  const last = lastForceRefreshByUser.get(userId) ?? 0;
  return Date.now() - last >= FORCE_REFRESH_COOLDOWN_MS;
}

function markForceRefresh(userId: string): void {
  lastForceRefreshByUser.set(userId, Date.now());
}

export async function loadCachedSiteMetrics(
  context: ActionContextLike,
  input: {
    period: MetricsPeriod;
    siteUrl: string | undefined;
    force?: boolean;
    userId: string;
  },
): Promise<{ metrics: ZoneSiteMetrics; stale: boolean }> {
  const { zoneId } = resolveCloudflareAnalyticsCredentials(context.locals);
  const host = parseSiteHost(input.siteUrl);
  if (!zoneId || !host) {
    throw new CloudflareGraphqlError(
      "Missing zone or site host",
      "graphql_error",
    );
  }

  const cacheKey = metricsCacheKey("site", zoneId, host, input.period);

  if (!input.force) {
    const cached = await getCachedJson<ZoneSiteMetrics>(context, cacheKey);
    if (cached) {
      return { metrics: cached, stale: false };
    }
  } else if (!canForceRefresh(input.userId)) {
    const cached = await getCachedJson<ZoneSiteMetrics>(context, cacheKey);
    if (cached) {
      return { metrics: cached, stale: true };
    }
  } else {
    markForceRefresh(input.userId);
  }

  return dedupeInFlight(`site:${cacheKey}`, async () => {
    if (!input.force) {
      const cached = await getCachedJson<ZoneSiteMetrics>(context, cacheKey);
      if (cached) {
        return { metrics: cached, stale: false };
      }
    }

    const metrics = await fetchZoneSiteMetrics({
      period: input.period,
      siteUrl: input.siteUrl,
      locals: context.locals,
    });

    await setCachedJson(context, cacheKey, metrics, METRICS_CACHE_TTL_SECONDS);

    return { metrics, stale: false };
  });
}

export async function loadCachedTrafficSummary(
  context: ActionContextLike,
  input: {
    siteUrl: string | undefined;
    timeZone: string | undefined;
    force?: boolean;
    userId: string;
    now?: Date;
  },
): Promise<{ summary: TrafficSummary; stale: boolean }> {
  const { zoneId } = resolveCloudflareAnalyticsCredentials(context.locals);
  const host = parseSiteHost(input.siteUrl);
  if (!zoneId || !host) {
    throw new CloudflareGraphqlError(
      "Missing zone or site host",
      "graphql_error",
    );
  }

  const ranges = buildTrafficSummaryRanges(input.timeZone, input.now);
  const cacheKey = trafficSummaryCacheKey(
    zoneId,
    host,
    ranges.timeZone,
    ranges.current.start,
  );

  if (!input.force) {
    const cached = await getCachedJson<TrafficSummary>(context, cacheKey);
    if (cached) {
      return { summary: cached, stale: false };
    }
  } else if (!canForceRefresh(input.userId)) {
    const cached = await getCachedJson<TrafficSummary>(context, cacheKey);
    if (cached) {
      return { summary: cached, stale: true };
    }
  } else {
    markForceRefresh(input.userId);
  }

  return dedupeInFlight(`summary:${cacheKey}`, async () => {
    if (!input.force) {
      const cached = await getCachedJson<TrafficSummary>(context, cacheKey);
      if (cached) {
        return { summary: cached, stale: false };
      }
    }

    const [current, previous, yesterday] = await Promise.all([
      fetchZoneTrafficRange({
        ...ranges.current,
        siteUrl: input.siteUrl,
        locals: context.locals,
      }),
      fetchZoneTrafficRange({
        ...ranges.previous,
        siteUrl: input.siteUrl,
        locals: context.locals,
      }),
      fetchZoneTrafficRange({
        start: ranges.yesterday.start,
        end: ranges.yesterday.end,
        siteUrl: input.siteUrl,
        locals: context.locals,
      }),
    ]);

    const summary = buildTrafficSummary({
      ranges,
      current,
      previous,
      yesterday,
    });
    await setCachedJson(context, cacheKey, summary, METRICS_CACHE_TTL_SECONDS);
    return { summary, stale: false };
  });
}

export async function loadCachedPagesMetrics(
  context: ActionContextLike,
  input: {
    period: MetricsPeriod;
    siteUrl: string | undefined;
    pages: readonly PageForPublicPath[];
    force?: boolean;
    userId: string;
  },
): Promise<{ metrics: ZonePagesMetrics; stale: boolean }> {
  const { zoneId } = resolveCloudflareAnalyticsCredentials(context.locals);
  const host = parseSiteHost(input.siteUrl);
  if (!zoneId || !host) {
    throw new CloudflareGraphqlError(
      "Missing zone or site host",
      "graphql_error",
    );
  }

  const cacheKey = metricsCacheKey("paths", zoneId, host, input.period);

  if (!input.force) {
    const cached = await getCachedJson<ZonePagesMetrics>(context, cacheKey);
    if (cached) {
      return { metrics: cached, stale: false };
    }
  } else if (!canForceRefresh(input.userId)) {
    const cached = await getCachedJson<ZonePagesMetrics>(context, cacheKey);
    if (cached) {
      return { metrics: cached, stale: true };
    }
  } else {
    markForceRefresh(input.userId);
  }

  return dedupeInFlight(`paths:${cacheKey}`, async () => {
    if (!input.force) {
      const cached = await getCachedJson<ZonePagesMetrics>(context, cacheKey);
      if (cached) {
        return { metrics: cached, stale: false };
      }
    }

    const metrics = await fetchZonePagesMetrics({
      period: input.period,
      siteUrl: input.siteUrl,
      pages: input.pages,
      locals: context.locals,
    });

    await setCachedJson(context, cacheKey, metrics, METRICS_CACHE_TTL_SECONDS);

    return { metrics, stale: false };
  });
}

export async function listPagesForMetrics(
  adapter: StorageAdapter,
): Promise<PageForPublicPath[]> {
  const inventory = await adapter.listPagesDSL({ limit: 10_000, offset: 0 });
  return inventory.map((page) => ({
    slug: page.slug ?? page.id,
    parent: page.parent ?? null,
  }));
}

export function mapGraphqlFailure(
  error: unknown,
): "credentials_invalid" | "analytics_forbidden" | "query_failed" {
  if (isAnalyticsReadForbiddenError(error)) {
    return "analytics_forbidden";
  }
  if (error instanceof CloudflareGraphqlError) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "credentials_invalid";
    }
  }
  return "query_failed";
}
