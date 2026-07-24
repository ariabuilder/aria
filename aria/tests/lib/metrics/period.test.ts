import { describe, expect, it } from "vitest";

import {
  METRICS_GRAPHQL_CHUNK_MS,
  metricsPeriodToIsoRanges,
  splitIsoRange,
} from "../../../lib/metrics/period";

describe("metrics period chunking", () => {
  it("returns a single range for 24h", () => {
    const ranges = metricsPeriodToIsoRanges("24h");
    expect(ranges).toHaveLength(1);

    const spanMs =
      new Date(ranges[0]!.end).getTime() - new Date(ranges[0]!.start).getTime();
    expect(spanMs).toBeLessThanOrEqual(METRICS_GRAPHQL_CHUNK_MS);
  });

  it("splits 7d into multiple 24h windows", () => {
    const ranges = metricsPeriodToIsoRanges("7d");
    expect(ranges.length).toBeGreaterThanOrEqual(7);

    for (const range of ranges) {
      const spanMs =
        new Date(range.end).getTime() - new Date(range.start).getTime();
      expect(spanMs).toBeLessThanOrEqual(METRICS_GRAPHQL_CHUNK_MS);
      expect(spanMs).toBeGreaterThan(0);
    }

    const firstStartMs = new Date(ranges[0]!.start).getTime();
    const lastEndMs = new Date(ranges[ranges.length - 1]!.end).getTime();
    const totalSpanMs = lastEndMs - firstStartMs;
    expect(totalSpanMs).toBeGreaterThan(6 * METRICS_GRAPHQL_CHUNK_MS);
    expect(totalSpanMs).toBeLessThanOrEqual(7 * METRICS_GRAPHQL_CHUNK_MS);
  });

  it("splits exact ranges into contiguous non-overlapping chunks", () => {
    const ranges = splitIsoRange(
      "2026-07-20T04:00:00.000Z",
      "2026-07-23T15:30:00.000Z",
    );

    expect(ranges[0]?.start).toBe("2026-07-20T04:00:00.000Z");
    expect(ranges.at(-1)?.end).toBe("2026-07-23T15:30:00.000Z");
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]?.start).toBe(ranges[index - 1]?.end);
    }
  });
});
