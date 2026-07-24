import { describe, expect, it } from "vitest";

import {
  buildTrafficMetricChange,
  buildTrafficSummary,
  buildTrafficSummaryRanges,
} from "../../../lib/metrics/trafficSummary";

describe("traffic summary calendar ranges", () => {
  it("uses Monday weeks and completed local days", () => {
    const ranges = buildTrafficSummaryRanges(
      "America/Toronto",
      new Date("2026-07-23T15:30:00.000Z"),
    );

    expect(ranges).toEqual({
      timeZone: "America/Toronto",
      current: {
        start: "2026-07-20T04:00:00.000Z",
        end: "2026-07-23T15:30:00.000Z",
      },
      previous: {
        start: "2026-07-13T04:00:00.000Z",
        end: "2026-07-16T15:30:00.000Z",
      },
      yesterday: {
        start: "2026-07-22T04:00:00.000Z",
        end: "2026-07-23T04:00:00.000Z",
        localDate: "2026-07-22",
      },
    });
  });

  it("preserves local comparison time across daylight-saving changes", () => {
    const ranges = buildTrafficSummaryRanges(
      "America/Toronto",
      new Date("2026-03-09T14:00:00.000Z"),
    );

    expect(ranges.current.start).toBe("2026-03-09T04:00:00.000Z");
    expect(ranges.previous.start).toBe("2026-03-02T05:00:00.000Z");
    expect(ranges.previous.end).toBe("2026-03-02T15:00:00.000Z");
    expect(ranges.yesterday).toMatchObject({
      start: "2026-03-08T05:00:00.000Z",
      end: "2026-03-09T04:00:00.000Z",
      localDate: "2026-03-08",
    });
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(
      buildTrafficSummaryRanges(
        "Not/A_Zone",
        new Date("2026-07-23T15:30:00.000Z"),
      ).timeZone,
    ).toBe("UTC");
  });
});

describe("traffic summary comparisons", () => {
  it("computes a rounded week-over-week change", () => {
    expect(buildTrafficMetricChange(600, 500)).toEqual({
      current: 600,
      previous: 500,
      absoluteChange: 100,
      percentChange: 20,
      direction: "up",
    });
    expect(buildTrafficMetricChange(400, 600).percentChange).toBe(-33.3);
  });

  it("does not invent a percentage without a baseline", () => {
    expect(buildTrafficMetricChange(12, 0)).toEqual({
      current: 12,
      previous: 0,
      absoluteChange: 12,
      percentChange: null,
      direction: "no_baseline",
    });
  });

  it("builds the grounded summary payload used by the agent", () => {
    const ranges = buildTrafficSummaryRanges(
      "UTC",
      new Date("2026-07-23T12:00:00.000Z"),
    );
    const summary = buildTrafficSummary({
      ranges,
      current: { ...ranges.current, visits: 600, requests: 900, bandwidthBytes: 1200 },
      previous: { ...ranges.previous, visits: 500, requests: 800, bandwidthBytes: 1000 },
      yesterday: {
        start: ranges.yesterday.start,
        end: ranges.yesterday.end,
        visits: 184,
        requests: 260,
        bandwidthBytes: 400,
      },
      fetchedAt: "2026-07-23T12:00:01.000Z",
    });

    expect(summary.changes.visits.percentChange).toBe(20);
    expect(summary.yesterday.visits).toBe(184);
    expect(summary.previous.label).toBe("same_point_last_week");
  });
});

