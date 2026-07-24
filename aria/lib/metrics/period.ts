/**
 * Metrics time window helpers.
 */

import type { MetricsPeriod } from "./types";

/** Cloudflare `httpRequestsAdaptiveGroups` filters allow at most ~24h per query. */
export const METRICS_GRAPHQL_CHUNK_MS = 24 * 60 * 60 * 1000;

export function splitIsoRange(
  start: string,
  end: string,
): Array<{ start: string; end: string }> {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [{ start, end }];
  }

  if (endMs - startMs <= METRICS_GRAPHQL_CHUNK_MS) {
    return [{ start, end }];
  }

  const ranges: Array<{ start: string; end: string }> = [];
  let chunkEndMs = endMs;

  while (chunkEndMs > startMs) {
    const chunkStartMs = Math.max(startMs, chunkEndMs - METRICS_GRAPHQL_CHUNK_MS);
    ranges.unshift({
      start: new Date(chunkStartMs).toISOString(),
      end: new Date(chunkEndMs).toISOString(),
    });
    chunkEndMs = chunkStartMs;
  }

  return ranges;
}

export function metricsPeriodToIsoRange(period: MetricsPeriod): {
  start: string;
  end: string;
} {
  const end = new Date();
  const start = new Date(end);

  switch (period) {
    case "24h":
      start.setUTCHours(start.getUTCHours() - 24);
      break;
    case "7d":
      start.setUTCDate(start.getUTCDate() - 7);
      break;
    case "30d":
      start.setUTCDate(start.getUTCDate() - 30);
      break;
    default: {
      const _exhaustive: never = period;
      void _exhaustive;
      start.setUTCDate(start.getUTCDate() - 7);
    }
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Split a metrics period into consecutive windows (newest last) for GraphQL queries.
 */
export function metricsPeriodToIsoRanges(
  period: MetricsPeriod,
): Array<{ start: string; end: string }> {
  const { start, end } = metricsPeriodToIsoRange(period);
  return splitIsoRange(start, end);
}

export function metricsPeriodLabel(period: MetricsPeriod): string {
  switch (period) {
    case "24h":
      return "24h";
    case "7d":
      return "7d";
    case "30d":
      return "30d";
    default:
      return period;
  }
}

/** Marketing-friendly period phrase for UI subtitles. */
export function metricsPeriodDescription(period: MetricsPeriod): string {
  switch (period) {
    case "24h":
      return "last 24 hours";
    case "7d":
      return "last 7 days";
    case "30d":
      return "last 30 days";
    default:
      return "selected period";
  }
}
