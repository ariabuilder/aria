import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getMetricsAvailabilityMock,
  getSiteTrafficMock,
  getPagesTrafficMock,
} = vi.hoisted(() => ({
  getMetricsAvailabilityMock: vi.fn(),
  getSiteTrafficMock: vi.fn(),
  getPagesTrafficMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    analytics: {
      getMetricsAvailability: (...args: unknown[]) =>
        getMetricsAvailabilityMock(...args),
      getSiteTraffic: (...args: unknown[]) => getSiteTrafficMock(...args),
      getPagesTraffic: (...args: unknown[]) => getPagesTrafficMock(...args),
    },
  },
}));

const readyAvailability = {
  available: true,
  canShowStudioMetrics: true,
  platform: "cloudflare" as const,
  credentialsReady: true,
  zoneConfigured: true,
  siteToggleEnabled: true,
  cloudflareTrafficEnabled: true,
  canViewMetrics: true,
  canConfigureMetrics: true,
};

describe("useStudioMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clearMetricsSessionCache resets traffic error and fetched timestamps", async () => {
    getMetricsAvailabilityMock.mockResolvedValue({
      data: readyAvailability,
      error: null,
    });
    getSiteTrafficMock.mockResolvedValue({
      data: {
        available: false,
        reason: "query_failed",
      },
      error: null,
    });
    getPagesTrafficMock.mockResolvedValue({
      data: { available: true, bySlug: {} },
      error: null,
    });

    const { useStudioMetrics } = await import(
      "../../../../admin/features/Studio/metrics/composables/useStudioMetrics"
    );
    const metrics = useStudioMetrics();

    await metrics.refreshAvailability(true);
    await metrics.ensureTrafficLoaded();

    expect(metrics.trafficError.value).toContain("API token");

    metrics.clearMetricsSessionCache();

    expect(metrics.trafficError.value).toBeNull();
    expect(metrics.siteFetchedAt.value).toBeUndefined();
    expect(metrics.siteStale.value).toBe(false);
    expect(metrics.availability.value).toBeNull();
    expect(metrics.siteVisits.value).toBe(0);
  });

  it("clears display state when canShowMetrics becomes false", async () => {
    getMetricsAvailabilityMock
      .mockResolvedValueOnce({
        data: readyAvailability,
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ...readyAvailability,
          canShowStudioMetrics: false,
          cloudflareTrafficEnabled: false,
          siteToggleEnabled: false,
          reason: "disabled",
        },
        error: null,
      });
    getSiteTrafficMock.mockResolvedValue({
      data: {
        available: true,
        metrics: {
          period: "7d",
          visits: 42,
          requests: 100,
          bandwidthBytes: 1024,
          hourlyVisits: [2, 4],
          hourlyRequests: [5, 10],
          hourlyBandwidthBytes: [256, 768],
          hourlyTimestamps: [
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T01:00:00.000Z",
          ],
          fetchedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      error: null,
    });
    getPagesTrafficMock.mockResolvedValue({
      data: { available: true, bySlug: { home: 42 } },
      error: null,
    });

    const { useStudioMetrics } = await import(
      "../../../../admin/features/Studio/metrics/composables/useStudioMetrics"
    );
    const metrics = useStudioMetrics();

    await metrics.refreshAvailability(true);
    await metrics.ensureTrafficLoaded();
    expect(metrics.siteVisits.value).toBe(42);
    expect(metrics.siteRequests.value).toBe(100);
    expect(metrics.siteHourlyRequests.value).toEqual([5, 10]);
    expect(metrics.siteHourlyBandwidthBytes.value).toEqual([256, 768]);
    expect(metrics.siteHourlyTimestamps.value).toHaveLength(2);

    await metrics.refreshAvailability(true);

    expect(metrics.canShowMetrics.value).toBe(false);
    expect(metrics.siteVisits.value).toBe(0);
    expect(metrics.siteRequests.value).toBe(0);
    expect(metrics.siteHourlyRequests.value).toEqual([]);
    expect(metrics.trafficError.value).toBeNull();
  });

  it("exposes the availability failure as a user-facing message", async () => {
    getMetricsAvailabilityMock.mockResolvedValue({
      data: {
        ...readyAvailability,
        available: false,
        canShowStudioMetrics: false,
        analyticsReadGranted: false,
        reason: "analytics_forbidden",
      },
      error: null,
    });

    const { useStudioMetrics } = await import(
      "../../../../admin/features/Studio/metrics/composables/useStudioMetrics"
    );
    const metrics = useStudioMetrics();

    await metrics.refreshAvailability(true);

    expect(metrics.availabilityMessage.value).toContain("Analytics Read");
    expect(metrics.availabilityMessage.value).toContain("API token");
  });
});
