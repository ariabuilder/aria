import {
  fromAbsolute,
  startOfWeek,
  toCalendarDate,
} from "@internationalized/date";
import { normalizeSiteTimeZone } from "../datetime/timeZone";
import type {
  TrafficMetricChange,
  TrafficRangeTotals,
  TrafficSummary,
} from "./types";

export interface TrafficSummaryRanges {
  timeZone: string;
  current: { start: string; end: string };
  previous: { start: string; end: string };
  yesterday: { start: string; end: string; localDate: string };
}

export function buildTrafficSummaryRanges(
  timeZoneInput: string | undefined,
  now = new Date(),
): TrafficSummaryRanges {
  const timeZone = normalizeSiteTimeZone(timeZoneInput);
  const zonedNow = fromAbsolute(now.getTime(), timeZone);
  const today = toCalendarDate(zonedNow);
  const currentWeekStart = startOfWeek(today, "en-GB", "mon");
  const yesterday = today.subtract({ days: 1 });

  return {
    timeZone,
    current: {
      start: currentWeekStart.toDate(timeZone).toISOString(),
      end: now.toISOString(),
    },
    previous: {
      start: currentWeekStart
        .subtract({ weeks: 1 })
        .toDate(timeZone)
        .toISOString(),
      end: zonedNow.subtract({ weeks: 1 }).toDate().toISOString(),
    },
    yesterday: {
      start: yesterday.toDate(timeZone).toISOString(),
      end: today.toDate(timeZone).toISOString(),
      localDate: yesterday.toString(),
    },
  };
}

export function buildTrafficMetricChange(
  current: number,
  previous: number,
): TrafficMetricChange {
  const absoluteChange = current - previous;
  if (previous === 0) {
    return {
      current,
      previous,
      absoluteChange,
      percentChange: null,
      direction: "no_baseline",
    };
  }

  return {
    current,
    previous,
    absoluteChange,
    percentChange: Math.round((absoluteChange / previous) * 1_000) / 10,
    direction:
      absoluteChange > 0
        ? "up"
        : absoluteChange < 0
          ? "down"
          : "unchanged",
  };
}

export function buildTrafficSummary(input: {
  ranges: TrafficSummaryRanges;
  current: TrafficRangeTotals;
  previous: TrafficRangeTotals;
  yesterday: TrafficRangeTotals;
  fetchedAt?: string;
}): TrafficSummary {
  return {
    timeZone: input.ranges.timeZone,
    weekStartsOn: "monday",
    current: { label: "this_week", ...input.current },
    previous: { label: "same_point_last_week", ...input.previous },
    yesterday: {
      label: "yesterday",
      localDate: input.ranges.yesterday.localDate,
      ...input.yesterday,
    },
    changes: {
      visits: buildTrafficMetricChange(
        input.current.visits,
        input.previous.visits,
      ),
      requests: buildTrafficMetricChange(
        input.current.requests,
        input.previous.requests,
      ),
      bandwidthBytes: buildTrafficMetricChange(
        input.current.bandwidthBytes,
        input.previous.bandwidthBytes,
      ),
    },
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
  };
}

