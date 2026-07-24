/**
 * Apply zone hostname validation to availability result.
 */

import type { ZoneHostCheckResult } from "../cloudflare/analytics/zoneValidation";
import {
  AnalyticsAvailabilitySchema,
  type AnalyticsAvailability,
} from "./schemas";

export function applyZoneHostCheck(
  availability: AnalyticsAvailability,
  zoneCheck: ZoneHostCheckResult,
): AnalyticsAvailability {
  if (!zoneCheck.checked || !zoneCheck.hostMismatch) {
    return AnalyticsAvailabilitySchema.parse({
      ...availability,
      hostMismatch: zoneCheck.checked ? false : availability.hostMismatch,
    });
  }

  return AnalyticsAvailabilitySchema.parse({
    ...availability,
    available: false,
    canShowStudioMetrics: false,
    hostMismatch: true,
    reason: "host_mismatch",
  });
}
