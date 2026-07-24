/**
 * Zod schemas for Studio traffic metrics actions.
 */

import { z } from "zod";

export const MetricsPeriodSchema = z.enum(["24h", "7d", "30d"]);

export const AnalyticsAvailabilityReasonSchema = z.enum([
  "unauthenticated",
  "forbidden",
  "local_platform",
  "credentials_missing",
  "credentials_invalid",
  "disabled",
  "host_mismatch",
  "query_failed",
  "analytics_forbidden",
  "no_traffic_for_host",
]);

export const AnalyticsAvailabilitySchema = z.object({
  available: z.boolean(),
  canShowStudioMetrics: z.boolean(),
  platform: z.enum(["cloudflare", "local"]),
  credentialsReady: z.boolean(),
  zoneConfigured: z.boolean(),
  siteToggleEnabled: z.boolean(),
  cloudflareTrafficEnabled: z.boolean(),
  canViewMetrics: z.boolean(),
  canConfigureMetrics: z.boolean(),
  siteHost: z.string().optional(),
  hostMismatch: z.boolean().optional(),
  siteUrlMismatch: z.boolean().optional(),
  requestHost: z.string().optional(),
  suggestedSiteUrl: z.string().optional(),
  zoneName: z.string().optional(),
  zoneHostChecked: z.boolean().optional(),
  analyticsReadGranted: z.boolean().optional(),
  reason: AnalyticsAvailabilityReasonSchema.optional(),
});

export type AnalyticsAvailability = z.infer<typeof AnalyticsAvailabilitySchema>;

export const SiteTrafficResponseSchema = z.object({
  available: z.boolean(),
  metrics: z
    .object({
      period: MetricsPeriodSchema,
      visits: z.number(),
      requests: z.number(),
      bandwidthBytes: z.number(),
      fetchedAt: z.string(),
      periodEnd: z.string(),
      stale: z.boolean().optional(),
      hourlyVisits: z.array(z.number()).optional(),
      hourlyRequests: z.array(z.number()).optional(),
      hourlyBandwidthBytes: z.array(z.number()).optional(),
      hourlyTimestamps: z.array(z.string()).optional(),
    })
    .optional(),
  reason: AnalyticsAvailabilityReasonSchema.optional(),
});

export const PagesTrafficResponseSchema = z.object({
  available: z.boolean(),
  bySlug: z.record(z.string(), z.number()).optional(),
  unmappedVisits: z.number().optional(),
  fetchedAt: z.string().optional(),
  period: MetricsPeriodSchema.optional(),
  stale: z.boolean().optional(),
  reason: AnalyticsAvailabilityReasonSchema.optional(),
});

const TrafficRangeTotalsSchema = z.object({
  start: z.string(),
  end: z.string(),
  visits: z.number(),
  requests: z.number(),
  bandwidthBytes: z.number(),
});

const TrafficMetricChangeSchema = z.object({
  current: z.number(),
  previous: z.number(),
  absoluteChange: z.number(),
  percentChange: z.number().nullable(),
  direction: z.enum(["up", "down", "unchanged", "no_baseline"]),
});

export const TrafficSummaryResponseSchema = z.object({
  available: z.boolean(),
  summary: z
    .object({
      timeZone: z.string(),
      weekStartsOn: z.literal("monday"),
      current: TrafficRangeTotalsSchema.extend({
        label: z.literal("this_week"),
      }),
      previous: TrafficRangeTotalsSchema.extend({
        label: z.literal("same_point_last_week"),
      }),
      yesterday: TrafficRangeTotalsSchema.extend({
        label: z.literal("yesterday"),
        localDate: z.string(),
      }),
      changes: z.object({
        visits: TrafficMetricChangeSchema,
        requests: TrafficMetricChangeSchema,
        bandwidthBytes: TrafficMetricChangeSchema,
      }),
      fetchedAt: z.string(),
      stale: z.boolean().optional(),
    })
    .optional(),
  reason: AnalyticsAvailabilityReasonSchema.optional(),
});
