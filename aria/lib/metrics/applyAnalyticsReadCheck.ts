/**
 * Apply Zone Analytics Read probe to availability result.
 */

import {
  AnalyticsAvailabilitySchema,
  type AnalyticsAvailability,
} from "./schemas";

export function applyAnalyticsReadCheck(
  availability: AnalyticsAvailability,
  analyticsReadGranted: boolean,
): AnalyticsAvailability {
  return AnalyticsAvailabilitySchema.parse({
    ...availability,
    analyticsReadGranted,
    ...(analyticsReadGranted === false && {
      canShowStudioMetrics: false,
      reason: "analytics_forbidden",
    }),
  });
}
