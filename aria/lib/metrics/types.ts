/**
 * Studio traffic metrics types (admin UI — not visitor beacon analytics).
 */

export type MetricsPeriod = "24h" | "7d" | "30d";

export type StudioMetricsUnavailableReason =
  | "unauthenticated"
  | "forbidden"
  | "local_platform"
  | "credentials_missing"
  | "credentials_invalid"
  | "disabled"
  | "host_mismatch"
  | "query_failed"
  | "analytics_forbidden";

export interface SiteMetricsSnapshot {
  period: MetricsPeriod;
  visits: number;
  requests: number;
  bandwidthBytes: number;
  fetchedAt: string;
  periodEnd: string;
  stale?: boolean;
}

export interface PageMetricsSnapshot {
  slug: string;
  visits: number;
  period: MetricsPeriod;
}

export interface TrafficRangeTotals {
  start: string;
  end: string;
  visits: number;
  requests: number;
  bandwidthBytes: number;
}

export type TrafficChangeDirection =
  | "up"
  | "down"
  | "unchanged"
  | "no_baseline";

export interface TrafficMetricChange {
  current: number;
  previous: number;
  absoluteChange: number;
  percentChange: number | null;
  direction: TrafficChangeDirection;
}

export interface TrafficSummary {
  timeZone: string;
  weekStartsOn: "monday";
  current: TrafficRangeTotals & { label: "this_week" };
  previous: TrafficRangeTotals & { label: "same_point_last_week" };
  yesterday: TrafficRangeTotals & {
    label: "yesterday";
    localDate: string;
  };
  changes: {
    visits: TrafficMetricChange;
    requests: TrafficMetricChange;
    bandwidthBytes: TrafficMetricChange;
  };
  fetchedAt: string;
}
