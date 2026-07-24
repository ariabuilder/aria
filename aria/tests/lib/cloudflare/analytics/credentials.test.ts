import { describe, expect, it } from "vitest";

import { resolveCloudflareAnalyticsCredentials } from "../../../../lib/cloudflare/analytics/credentials";

describe("resolveCloudflareAnalyticsCredentials", () => {
  it("prefers the dedicated analytics token over the general Cloudflare token", () => {
    const credentials = resolveCloudflareAnalyticsCredentials({
      cfBindings: {
        ARIA_CLOUDFLARE_ANALYTICS_TOKEN: "analytics-token",
        ARIA_CLOUDFLARE_API_TOKEN: "general-token",
        ARIA_CLOUDFLARE_ZONE_ID: "zone-id",
      },
    });

    expect(credentials).toEqual({
      apiToken: "analytics-token",
      zoneId: "zone-id",
    });
  });

  it("falls back to the general Cloudflare token", () => {
    const credentials = resolveCloudflareAnalyticsCredentials({
      cfBindings: {
        ARIA_CLOUDFLARE_API_TOKEN: "general-token",
        ARIA_CLOUDFLARE_ZONE_ID: "zone-id",
      },
    });

    expect(credentials).toEqual({
      apiToken: "general-token",
      zoneId: "zone-id",
    });
  });
});
