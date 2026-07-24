import { describe, expect, it } from "vitest";

import { applyAnalyticsReadCheck } from "../../../lib/metrics/applyAnalyticsReadCheck";
import { resolveMetricsAvailability } from "../../../lib/metrics/availability";
import type { AdapterInfo } from "../../../lib/storage/adapter";
import type { SessionUser } from "../../../lib/auth/types";

const CLOUDFLARE_INFO: AdapterInfo = {
  platform: "cloudflare",
  displayName: "Cloudflare",
  capabilities: {
    database: true,
    kv: true,
    objectStorage: true,
    edgeNetwork: true,
    deploymentApi: false,
  },
};

const LOCAL_INFO: AdapterInfo = {
  platform: "local",
  displayName: "Local",
  capabilities: {
    database: false,
    kv: false,
    objectStorage: false,
    edgeNetwork: false,
    deploymentApi: false,
  },
};

function sessionUser(role: SessionUser["role"]): SessionUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    username: "tester",
    email: "test@example.com",
    role,
    totpEnabled: false,
  };
}

describe("resolveMetricsAvailability", () => {
  it("returns unauthenticated when user is null", () => {
    const result = resolveMetricsAvailability({
      user: null,
      adapterInfo: CLOUDFLARE_INFO,
      siteSettings: {},
    });

    expect(result.canShowStudioMetrics).toBe(false);
    expect(result.reason).toBe("unauthenticated");
  });

  it("hides chrome for contributor by default", () => {
    const result = resolveMetricsAvailability({
      user: sessionUser("contributor"),
      adapterInfo: CLOUDFLARE_INFO,
      siteSettings: {
        analytics: {
          version: 1,
          activeProviders: [],
          providers: {},
          studioDisplay: { cloudflareTraffic: true },
        },
      },
      locals: {
        cfBindings: {
            ARIA_CLOUDFLARE_API_TOKEN: "token",
            ARIA_CLOUDFLARE_ZONE_ID: "zone",
          },
      },
    });

    expect(result.canShowStudioMetrics).toBe(false);
    expect(result.reason).toBe("forbidden");
  });

  it("shows chrome for manager when toggle and credentials are ready", () => {
    const result = resolveMetricsAvailability({
      user: sessionUser("manager"),
      adapterInfo: CLOUDFLARE_INFO,
      siteSettings: {
        analytics: {
          version: 1,
          activeProviders: [],
          providers: {},
          studioDisplay: { cloudflareTraffic: true },
        },
      },
      locals: {
        cfBindings: {
            ARIA_CLOUDFLARE_API_TOKEN: "token",
            ARIA_CLOUDFLARE_ZONE_ID: "zone",
          },
      },
    });

    expect(result.canShowStudioMetrics).toBe(true);
    expect(result.canConfigureMetrics).toBe(false);
  });

  it("fails layer 1 on local platform", () => {
    const result = resolveMetricsAvailability({
      user: sessionUser("administrator"),
      adapterInfo: LOCAL_INFO,
      siteSettings: {
        analytics: {
          version: 1,
          activeProviders: [],
          providers: {},
          studioDisplay: { cloudflareTraffic: true },
        },
      },
    });

    expect(result.canShowStudioMetrics).toBe(false);
    expect(result.reason).toBe("local_platform");
  });

  it("fails layer 3 when site toggle is off", () => {
    const result = resolveMetricsAvailability({
      user: sessionUser("administrator"),
      adapterInfo: CLOUDFLARE_INFO,
      siteSettings: {
        analytics: {
          version: 1,
          activeProviders: [],
          providers: {},
        },
      },
      locals: {
        cfBindings: {
            ARIA_CLOUDFLARE_API_TOKEN: "token",
            ARIA_CLOUDFLARE_ZONE_ID: "zone",
          },
      },
    });

    expect(result.canShowStudioMetrics).toBe(false);
    expect(result.reason).toBe("disabled");
  });

  it("hides metrics when analytics read probe is denied after layers pass", () => {
    const base = resolveMetricsAvailability({
      user: sessionUser("administrator"),
      adapterInfo: CLOUDFLARE_INFO,
      siteSettings: {
        analytics: {
          version: 1,
          activeProviders: [],
          providers: {},
          studioDisplay: { cloudflareTraffic: true },
        },
      },
      locals: {
        cfBindings: {
            ARIA_CLOUDFLARE_API_TOKEN: "token",
            ARIA_CLOUDFLARE_ZONE_ID: "zone",
          },
      },
    });

    expect(base.canShowStudioMetrics).toBe(true);

    const denied = applyAnalyticsReadCheck(base, false);

    expect(denied.canShowStudioMetrics).toBe(false);
    expect(denied.analyticsReadGranted).toBe(false);
    expect(denied.reason).toBe("analytics_forbidden");
  });
});
