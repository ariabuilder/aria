import { describe, expect, it } from "vitest";

import { CloudflareGraphqlError } from "../../../lib/cloudflare/analytics/graphql";
import { mapGraphqlFailure } from "../../../lib/metrics/studioMetricsService";

describe("mapGraphqlFailure", () => {
  it("maps analytics read permission errors", () => {
    const error = new CloudflareGraphqlError(
      "Actor does not have permission zone.analytics.read",
      "analytics_forbidden",
    );
    expect(mapGraphqlFailure(error)).toBe("analytics_forbidden");
  });

  it("maps HTTP 403 to credentials_invalid when not analytics", () => {
    const error = new CloudflareGraphqlError(
      "Forbidden",
      "http_error",
      403,
    );
    expect(mapGraphqlFailure(error)).toBe("credentials_invalid");
  });
});
