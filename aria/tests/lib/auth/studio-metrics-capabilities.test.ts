import { describe, expect, it } from "vitest";

import {
  CAPABILITY_OPERATIONS,
  getCapabilitiesForOperation,
} from "../../../lib/auth/capabilityOperations";
import { ROLE_DEFAULT_CAPABILITIES } from "../../../lib/auth/types";

describe("Studio traffic metrics capabilities", () => {
  it("maps analytics.getMetricsAvailability to viewStudioMetrics and editAnalytics", () => {
    const caps = getCapabilitiesForOperation("analytics.getMetricsAvailability");
    expect(caps).toContain("viewStudioMetrics");
    expect(caps).toContain("editAnalytics");
  });

  it("maps traffic data ops to viewStudioMetrics only", () => {
    for (const op of [
      "analytics.getSiteTraffic",
      "analytics.getPagesTraffic",
      "analytics.getPageTraffic",
    ] as const) {
      expect(getCapabilitiesForOperation(op)).toEqual(["viewStudioMetrics"]);
    }
  });

  it("includes viewStudioMetrics on manager and content-editor presets", () => {
    expect(ROLE_DEFAULT_CAPABILITIES.manager).toContain("viewStudioMetrics");
    expect(ROLE_DEFAULT_CAPABILITIES["content-editor"]).toContain(
      "viewStudioMetrics",
    );
    expect(ROLE_DEFAULT_CAPABILITIES.contributor).not.toContain(
      "viewStudioMetrics",
    );
  });

  it("registers all analytics operations on viewStudioMetrics", () => {
    expect(CAPABILITY_OPERATIONS.viewStudioMetrics).toContain(
      "analytics.getMetricsAvailability",
    );
    expect(CAPABILITY_OPERATIONS.viewStudioMetrics).toContain(
      "analytics.getSiteTraffic",
    );
  });
});
