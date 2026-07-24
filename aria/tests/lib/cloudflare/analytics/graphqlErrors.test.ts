import { describe, expect, it } from "vitest";

import {
  CloudflareGraphqlError,
  isAnalyticsReadForbiddenError,
} from "../../../../lib/cloudflare/analytics/graphql";

describe("isAnalyticsReadForbiddenError", () => {
  it("detects analytics.read permission errors", () => {
    const error = new CloudflareGraphqlError(
      "Actor does not have permission 'com.cloudflare.api.account.zone.analytics.read'",
      "graphql_error",
    );
    expect(isAnalyticsReadForbiddenError(error)).toBe(true);
  });

  it("detects analytics_forbidden code", () => {
    const error = new CloudflareGraphqlError(
      "Forbidden",
      "analytics_forbidden",
      403,
    );
    expect(isAnalyticsReadForbiddenError(error)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    const error = new CloudflareGraphqlError("Zone not found", "graphql_error");
    expect(isAnalyticsReadForbiddenError(error)).toBe(false);
  });
});
