/**
 * Server-side Studio traffic metrics availability (layers 1–4).
 */

import {
  resolveEffectiveCapabilities,
  type Capability,
  type SessionUser,
} from "../auth/types";
import { resolveUserPermissionProfile } from "../authorship/permissionProfile";
import type { AdapterInfo, SiteSettings } from "../storage/adapter";
import { areCloudflareAnalyticsCredentialsReady } from "../cloudflare/analytics/credentials";
import type { RuntimeLocals } from "../cloudflare/env";
import {
  AnalyticsAvailabilitySchema,
  type AnalyticsAvailability,
} from "./schemas";

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

function hasCapability(user: SessionUser, capability: Capability): boolean {
  const effective = resolveEffectiveCapabilities(
    resolveUserPermissionProfile(user),
  );
  return effective.includes(capability);
}

export interface ResolveMetricsAvailabilityInput {
  user: SessionUser | null;
  adapterInfo: AdapterInfo;
  siteSettings: SiteSettings | null | undefined;
  locals?: RuntimeLocals;
}

export function resolveMetricsAvailability(
  input: ResolveMetricsAvailabilityInput,
): AnalyticsAvailability {
  const { user, adapterInfo, siteSettings, locals } = input;

  const platform =
    adapterInfo.platform === "cloudflare" ? "cloudflare" : "local";
  const credentialsReady = areCloudflareAnalyticsCredentialsReady(locals);
  const zoneConfigured = credentialsReady;
  const siteToggleEnabled = Boolean(
    siteSettings?.analytics?.studioDisplay?.cloudflareTraffic,
  );
  const cloudflareTrafficEnabled = siteToggleEnabled;
  const siteHost = parseSiteHost(siteSettings?.siteUrl);

  const canViewMetrics = user
    ? hasCapability(user, "viewStudioMetrics")
    : false;
  const canConfigureMetrics = user
    ? hasCapability(user, "editAnalytics")
    : false;

  const canCheckAvailability = canViewMetrics || canConfigureMetrics;

  if (!user) {
    return AnalyticsAvailabilitySchema.parse({
      available: false,
      canShowStudioMetrics: false,
      platform,
      credentialsReady,
      zoneConfigured,
      siteToggleEnabled,
      cloudflareTrafficEnabled,
      canViewMetrics: false,
      canConfigureMetrics: false,
      siteHost,
      reason: "unauthenticated",
    });
  }

  if (!canCheckAvailability) {
    return AnalyticsAvailabilitySchema.parse({
      available: false,
      canShowStudioMetrics: false,
      platform,
      credentialsReady,
      zoneConfigured,
      siteToggleEnabled,
      cloudflareTrafficEnabled,
      canViewMetrics,
      canConfigureMetrics,
      siteHost,
      reason: "forbidden",
    });
  }

  if (platform !== "cloudflare") {
    return AnalyticsAvailabilitySchema.parse({
      available: false,
      canShowStudioMetrics: false,
      platform,
      credentialsReady,
      zoneConfigured,
      siteToggleEnabled,
      cloudflareTrafficEnabled,
      canViewMetrics,
      canConfigureMetrics,
      siteHost,
      reason: "local_platform",
    });
  }

  if (!credentialsReady) {
    return AnalyticsAvailabilitySchema.parse({
      available: false,
      canShowStudioMetrics: false,
      platform,
      credentialsReady: false,
      zoneConfigured: false,
      siteToggleEnabled,
      cloudflareTrafficEnabled,
      canViewMetrics,
      canConfigureMetrics,
      siteHost,
      reason: "credentials_missing",
    });
  }

  if (!siteToggleEnabled) {
    return AnalyticsAvailabilitySchema.parse({
      available: false,
      canShowStudioMetrics: false,
      platform,
      credentialsReady,
      zoneConfigured,
      siteToggleEnabled: false,
      cloudflareTrafficEnabled: false,
      canViewMetrics,
      canConfigureMetrics,
      siteHost,
      reason: "disabled",
    });
  }

  if (!canViewMetrics) {
    return AnalyticsAvailabilitySchema.parse({
      available: true,
      canShowStudioMetrics: false,
      platform,
      credentialsReady,
      zoneConfigured,
      siteToggleEnabled,
      cloudflareTrafficEnabled,
      canViewMetrics: false,
      canConfigureMetrics,
      siteHost,
      reason: "forbidden",
    });
  }

  return AnalyticsAvailabilitySchema.parse({
    available: true,
    canShowStudioMetrics: true,
    platform,
    credentialsReady,
    zoneConfigured,
    siteToggleEnabled,
    cloudflareTrafficEnabled,
    canViewMetrics,
    canConfigureMetrics,
    siteHost,
  });
}
