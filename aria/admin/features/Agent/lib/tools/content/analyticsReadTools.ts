import { getStorageAdapterAsync } from "../../../../../../lib/storage/getStorageAdapter";
import type { AdapterInfo } from "../../../../../../lib/storage/adapter";
import { resolveMetricsAvailability } from "../../../../../../lib/metrics/availability";
import {
  listPagesForMetrics,
  loadCachedPagesMetrics,
  loadCachedSiteMetrics,
  loadCachedTrafficSummary,
  mapGraphqlFailure,
} from "../../../../../../lib/metrics/studioMetricsService";
import {
  getAuthUser,
  requireOperation,
} from "../../../../../../actions/_shared";
import {
  AriaGetAnalyticsAvailabilityInputSchema,
  AriaGetPageTrafficInputSchema,
  AriaGetPagesTrafficInputSchema,
  AriaGetSiteTrafficInputSchema,
  AriaGetTrafficSummaryInputSchema,
  type AgentToolResult,
} from "../../schemas";
import {
  mapActionErrorToToolError,
  toolErrorFromZod,
  toolErrorResult,
  toolSuccessResult,
} from "../toolErrors";
import { toToolActionContext } from "../toolActionContext";
import type { AgentToolActionContext } from "../types";

const LOCAL_ADAPTER_INFO: AdapterInfo = {
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

async function loadAdapterState(context: AgentToolActionContext) {
  const actionContext = toToolActionContext(context);
  const adapter = await getStorageAdapterAsync(actionContext.locals);
  const siteSettings = await adapter.getSiteSettings();
  let adapterInfo = LOCAL_ADAPTER_INFO;
  try {
    adapterInfo = (await adapter.getAdapterInfo?.()) ?? LOCAL_ADAPTER_INFO;
  } catch {
    // Availability reports local fallback instead of hiding a failed probe.
  }
  return { actionContext, adapter, siteSettings, adapterInfo };
}

export async function ariaGetAnalyticsAvailability(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaGetAnalyticsAvailabilityInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }
  try {
    const { actionContext, siteSettings, adapterInfo } =
      await loadAdapterState(context);
    const user = await getAuthUser(actionContext);
    return toolSuccessResult(
      resolveMetricsAvailability({
        user,
        adapterInfo,
        siteSettings,
        locals: actionContext.locals,
      }) as unknown as Record<string, unknown>,
    );
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}

export async function ariaGetTrafficSummary(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaGetTrafficSummaryInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  try {
    const { actionContext, siteSettings, adapterInfo } =
      await loadAdapterState(context);
    const user = await requireOperation(
      actionContext,
      "analytics.getSiteTraffic",
    );
    const availability = resolveMetricsAvailability({
      user,
      adapterInfo,
      siteSettings,
      locals: actionContext.locals,
    });
    if (!availability.canShowStudioMetrics) {
      return toolSuccessResult({
        available: false,
        reason: availability.reason ?? "disabled",
      });
    }
    if (!siteSettings?.siteUrl?.trim()) {
      return toolSuccessResult({
        available: false,
        reason: "no_traffic_for_host",
      });
    }

    try {
      const { summary, stale } = await loadCachedTrafficSummary(actionContext, {
        siteUrl: siteSettings.siteUrl,
        timeZone: siteSettings.timeZone,
        force: parsed.data.force,
        userId: user.id,
      });
      return toolSuccessResult({
        available: true,
        summary: { ...summary, stale },
      });
    } catch (error) {
      return toolSuccessResult({
        available: false,
        reason: mapGraphqlFailure(error),
      });
    }
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}

async function getTraffic(
  context: AgentToolActionContext,
  input: unknown,
  mode: "site" | "pages" | "page",
): Promise<AgentToolResult<Record<string, unknown>>> {
  const schema =
    mode === "site"
      ? AriaGetSiteTrafficInputSchema
      : mode === "pages"
        ? AriaGetPagesTrafficInputSchema
        : AriaGetPageTrafficInputSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }
  try {
    const { actionContext, adapter, siteSettings, adapterInfo } =
      await loadAdapterState(context);
    const operation =
      mode === "site"
        ? "analytics.getSiteTraffic"
        : mode === "pages"
          ? "analytics.getPagesTraffic"
          : "analytics.getPageTraffic";
    const user = await requireOperation(actionContext, operation);
    const availability = resolveMetricsAvailability({
      user,
      adapterInfo,
      siteSettings,
      locals: actionContext.locals,
    });
    if (!availability.canShowStudioMetrics) {
      return toolSuccessResult({
        available: false,
        reason: availability.reason ?? "disabled",
      });
    }
    if (!siteSettings?.siteUrl?.trim()) {
      return toolSuccessResult({
        available: false,
        reason: "no_traffic_for_host",
      });
    }

    try {
      if (mode === "site") {
        const { metrics, stale } = await loadCachedSiteMetrics(actionContext, {
          period: parsed.data.period,
          siteUrl: siteSettings.siteUrl,
          force: parsed.data.force,
          userId: user.id,
        });
        return toolSuccessResult({
          available: true,
          metrics: { ...metrics, stale },
        });
      }

      const pages = await listPagesForMetrics(adapter);
      const { metrics, stale } = await loadCachedPagesMetrics(actionContext, {
        period: parsed.data.period,
        siteUrl: siteSettings.siteUrl,
        pages,
        force: parsed.data.force,
        userId: user.id,
      });
      if (mode === "page") {
        const slug = (parsed.data as unknown as { slug: string }).slug;
        return toolSuccessResult({
          available: true,
          bySlug: { [slug]: metrics.bySlug[slug] ?? 0 },
          fetchedAt: metrics.fetchedAt,
          period: metrics.period,
          stale,
        });
      }
      return toolSuccessResult({
        available: true,
        bySlug: metrics.bySlug,
        unmappedVisits: metrics.unmappedVisits,
        fetchedAt: metrics.fetchedAt,
        period: metrics.period,
        stale,
      });
    } catch (error) {
      return toolSuccessResult({
        available: false,
        reason: mapGraphqlFailure(error),
      });
    }
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}

export const ariaGetSiteTraffic = (
  context: AgentToolActionContext,
  input: unknown,
) => getTraffic(context, input, "site");
export const ariaGetPagesTraffic = (
  context: AgentToolActionContext,
  input: unknown,
) => getTraffic(context, input, "pages");
export const ariaGetPageTraffic = (
  context: AgentToolActionContext,
  input: unknown,
) => getTraffic(context, input, "page");
