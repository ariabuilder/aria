/**
 * Studio traffic metrics actions (Cloudflare zone GraphQL).
 */

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import type { AdapterInfo } from "../lib/storage/adapter";
import { resolveCloudflareAnalyticsCredentials } from "../lib/cloudflare/analytics/credentials";
import { probeAnalyticsReadAccess } from "../lib/cloudflare/analytics/probeAnalyticsRead";
import { checkZoneHostAlignment } from "../lib/cloudflare/analytics/zoneValidation";
import { applyAnalyticsReadCheck } from "../lib/metrics/applyAnalyticsReadCheck";
import { applyZoneHostCheck } from "../lib/metrics/applyZoneHostCheck";
import { resolveMetricsAvailability } from "../lib/metrics/availability";
import {
  listPagesForMetrics,
  loadCachedPagesMetrics,
  loadCachedSiteMetrics,
  mapGraphqlFailure,
} from "../lib/metrics/studioMetricsService";
import {
  AnalyticsAvailabilitySchema,
  MetricsPeriodSchema,
  PagesTrafficResponseSchema,
  SiteTrafficResponseSchema,
} from "../lib/metrics/schemas";
import { log as baseLog } from "../lib/utils/logger";
import { getAuthUser, requireOperation } from "./_shared";

const LOCAL_FALLBACK_INFO: AdapterInfo = {
  platform: "local",
  displayName: "Local Filesystem",
  capabilities: {
    database: false,
    kv: false,
    objectStorage: false,
    edgeNetwork: false,
    deploymentApi: false,
  },
};

async function loadAdapterInfo(
  locals: Parameters<typeof getStorageAdapterAsync>[0],
): Promise<AdapterInfo> {
  try {
    const adapter = await getStorageAdapterAsync(locals);
    if (typeof adapter.getAdapterInfo === "function") {
      return await adapter.getAdapterInfo();
    }
    return LOCAL_FALLBACK_INFO;
  } catch {
    return LOCAL_FALLBACK_INFO;
  }
}

function logMetricsWarn(
  message: string,
  context?: Record<string, unknown>,
): void {
  baseLog("warn", `[Aria Analytics] ${message}`, context);
}

export const analytics = {
  getMetricsAvailability: defineAction({
    accept: "json",
    input: z.object({}),
    handler: async (_input, context) => {
      const user = await getAuthUser(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteSettings = await adapter.getSiteSettings();
      const adapterInfo = await loadAdapterInfo(context.locals);

      const base = resolveMetricsAvailability({
        user,
        adapterInfo,
        siteSettings,
        locals: context.locals,
      });

      // Detect site URL mismatch — when the configured siteUrl host doesn't
      // match the host the user is accessing the admin from, the Cloudflare
      // GraphQL query filters by siteUrl host and may return 0 traffic.
      let siteUrlMismatch: boolean | undefined;
      let requestHost: string | undefined;
      let suggestedSiteUrl: string | undefined;

      try {
        const reqUrl = new URL(context.request.url);
        const reqHost = reqUrl.hostname.toLowerCase();
        if (base.siteHost && reqHost && base.siteHost !== reqHost) {
          siteUrlMismatch = true;
          requestHost = reqHost;
          suggestedSiteUrl = `${reqUrl.protocol}//${reqHost}`;
        }
      } catch {
        // context.request.url may not be available in all runtimes
      }

      const { apiToken, zoneId } = resolveCloudflareAnalyticsCredentials(
        context.locals,
      );

      if (base.credentialsReady && apiToken && zoneId && base.siteHost) {
        const zoneCheck = await checkZoneHostAlignment({
          apiToken,
          zoneId,
          siteHost: base.siteHost,
        });
        const afterZone = applyZoneHostCheck(base, zoneCheck);
        const withZoneMeta = AnalyticsAvailabilitySchema.parse({
          ...afterZone,
          zoneName: zoneCheck.zoneName,
          zoneHostChecked: zoneCheck.checked,
          siteUrlMismatch,
          requestHost,
          suggestedSiteUrl,
        });

        if (!withZoneMeta.credentialsReady || withZoneMeta.hostMismatch) {
          return withZoneMeta;
        }

        const probe = await probeAnalyticsReadAccess({
          apiToken,
          zoneId,
          siteHost: base.siteHost,
        });
        return applyAnalyticsReadCheck(withZoneMeta, probe.granted);
      }

      return AnalyticsAvailabilitySchema.parse({
        ...base,
        siteUrlMismatch,
        requestHost,
        suggestedSiteUrl,
      });
    },
  }),

  getSiteTraffic: defineAction({
    accept: "json",
    input: z.object({
      period: MetricsPeriodSchema.default("7d"),
      force: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = await requireOperation(context, "analytics.getSiteTraffic");
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteSettings = await adapter.getSiteSettings();
      const adapterInfo = await loadAdapterInfo(context.locals);

      const availability = resolveMetricsAvailability({
        user,
        adapterInfo,
        siteSettings,
        locals: context.locals,
      });

      if (!availability.canShowStudioMetrics) {
        return SiteTrafficResponseSchema.parse({
          available: false,
          reason: availability.reason ?? "disabled",
        });
      }

      if (!siteSettings?.siteUrl?.trim()) {
        return SiteTrafficResponseSchema.parse({
          available: false,
          reason: "no_traffic_for_host",
        });
      }

      try {
        const { metrics, stale } = await loadCachedSiteMetrics(context, {
          period: input.period,
          siteUrl: siteSettings.siteUrl,
          force: input.force,
          userId: user.id,
        });

        return SiteTrafficResponseSchema.parse({
          available: true,
          metrics: {
            period: metrics.period,
            visits: metrics.visits,
            requests: metrics.requests,
            bandwidthBytes: metrics.bandwidthBytes,
            fetchedAt: metrics.fetchedAt,
            periodEnd: metrics.periodEnd,
            stale,
            hourlyVisits: metrics.hourlyVisits,
            hourlyRequests: metrics.hourlyRequests,
            hourlyBandwidthBytes: metrics.hourlyBandwidthBytes,
            hourlyTimestamps: metrics.hourlyTimestamps,
          },
        });
      } catch (error) {
        logMetricsWarn("getSiteTraffic failed", {
          reason: mapGraphqlFailure(error),
        });
        return SiteTrafficResponseSchema.parse({
          available: false,
          reason: mapGraphqlFailure(error),
        });
      }
    },
  }),

  getPagesTraffic: defineAction({
    accept: "json",
    input: z.object({
      period: MetricsPeriodSchema.default("7d"),
      force: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = await requireOperation(context, "analytics.getPagesTraffic");
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteSettings = await adapter.getSiteSettings();
      const adapterInfo = await loadAdapterInfo(context.locals);

      const availability = resolveMetricsAvailability({
        user,
        adapterInfo,
        siteSettings,
        locals: context.locals,
      });

      if (!availability.canShowStudioMetrics) {
        return PagesTrafficResponseSchema.parse({
          available: false,
          reason: availability.reason ?? "disabled",
        });
      }

      if (!siteSettings?.siteUrl?.trim()) {
        return PagesTrafficResponseSchema.parse({
          available: false,
          reason: "no_traffic_for_host",
        });
      }

      try {
        const pages = await listPagesForMetrics(adapter);
        const { metrics, stale } = await loadCachedPagesMetrics(context, {
          period: input.period,
          siteUrl: siteSettings.siteUrl,
          pages,
          force: input.force,
          userId: user.id,
        });

        return PagesTrafficResponseSchema.parse({
          available: true,
          bySlug: metrics.bySlug,
          unmappedVisits: metrics.unmappedVisits,
          fetchedAt: metrics.fetchedAt,
          period: metrics.period,
          stale,
        });
      } catch (error) {
        logMetricsWarn("getPagesTraffic failed", {
          reason: mapGraphqlFailure(error),
        });
        return PagesTrafficResponseSchema.parse({
          available: false,
          reason: mapGraphqlFailure(error),
        });
      }
    },
  }),

  getPageTraffic: defineAction({
    accept: "json",
    input: z.object({
      slug: z.string().min(1),
      period: MetricsPeriodSchema.default("7d"),
      force: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      await requireOperation(context, "analytics.getPageTraffic");
      const adapter = await getStorageAdapterAsync(context.locals);
      const siteSettings = await adapter.getSiteSettings();
      const adapterInfo = await loadAdapterInfo(context.locals);
      const user = await getAuthUser(context);

      const availability = resolveMetricsAvailability({
        user,
        adapterInfo,
        siteSettings,
        locals: context.locals,
      });

      if (!availability.canShowStudioMetrics) {
        return PagesTrafficResponseSchema.parse({
          available: false,
          reason: availability.reason ?? "disabled",
        });
      }

      try {
        const pages = await listPagesForMetrics(adapter);
        const { metrics } = await loadCachedPagesMetrics(context, {
          period: input.period,
          siteUrl: siteSettings?.siteUrl,
          pages,
          force: input.force,
          userId: user?.id ?? "anonymous",
        });

        const visits = metrics.bySlug[input.slug] ?? 0;

        return PagesTrafficResponseSchema.parse({
          available: true,
          bySlug: { [input.slug]: visits },
          fetchedAt: metrics.fetchedAt,
          period: metrics.period,
        });
      } catch (error) {
        logMetricsWarn("getPageTraffic failed", {
          slug: input.slug,
          reason: mapGraphqlFailure(error),
        });
        return PagesTrafficResponseSchema.parse({
          available: false,
          reason: mapGraphqlFailure(error),
        });
      }
    },
  }),
};
