import { describe, expect, it } from "vitest";

import { applyAnalyticsReadCheck } from "../../../lib/metrics/applyAnalyticsReadCheck";
import type { AnalyticsAvailability } from "../../../lib/metrics/schemas";

const baseReady: AnalyticsAvailability = {
  available: true,
  canShowStudioMetrics: true,
  platform: "cloudflare",
  credentialsReady: true,
  zoneConfigured: true,
  siteToggleEnabled: true,
  cloudflareTrafficEnabled: true,
  canViewMetrics: true,
  canConfigureMetrics: true,
  siteHost: "example.com",
};

describe("applyAnalyticsReadCheck", () => {
  it("hides traffic UI when analytics read is denied", () => {
    const result = applyAnalyticsReadCheck(baseReady, false);
    expect(result.canShowStudioMetrics).toBe(false);
    expect(result.analyticsReadGranted).toBe(false);
    expect(result.reason).toBe("analytics_forbidden");
  });

  it("preserves availability when analytics read is granted", () => {
    const result = applyAnalyticsReadCheck(baseReady, true);
    expect(result.canShowStudioMetrics).toBe(true);
    expect(result.analyticsReadGranted).toBe(true);
  });
});
