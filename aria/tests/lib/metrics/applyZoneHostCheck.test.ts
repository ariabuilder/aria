import { describe, expect, it } from "vitest";

import { applyZoneHostCheck } from "../../../lib/metrics/applyZoneHostCheck";
import type { AnalyticsAvailability } from "../../../lib/metrics/schemas";

const baseAvailability: AnalyticsAvailability = {
  available: true,
  canShowStudioMetrics: true,
  platform: "cloudflare",
  credentialsReady: true,
  zoneConfigured: true,
  siteToggleEnabled: true,
  cloudflareTrafficEnabled: true,
  canViewMetrics: true,
  canConfigureMetrics: true,
  siteHost: "www.example.com",
};

describe("applyZoneHostCheck", () => {
  it("blocks metrics when host mismatches zone", () => {
    const result = applyZoneHostCheck(baseAvailability, {
      checked: true,
      hostMismatch: true,
      zoneName: "other.com",
    });

    expect(result.canShowStudioMetrics).toBe(false);
    expect(result.hostMismatch).toBe(true);
    expect(result.reason).toBe("host_mismatch");
  });

  it("preserves availability when check not performed", () => {
    const result = applyZoneHostCheck(baseAvailability, {
      checked: false,
      hostMismatch: false,
    });

    expect(result.canShowStudioMetrics).toBe(true);
  });
});
