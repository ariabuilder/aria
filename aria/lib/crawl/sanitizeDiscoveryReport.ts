import {
  resolveEffectiveCapabilities,
  type SessionUser,
} from "../auth/types";
import { resolveUserPermissionProfile } from "../authorship/permissionProfile";
import type { DiscoveryReport, DiscoverySettings } from "./schemas";

const SENSITIVE_EXCLUSION_REASONS = new Set([
  "password",
  "private",
  "unlisted",
]);

function canEditDiscoverySettings(user: SessionUser): boolean {
  const effective = resolveEffectiveCapabilities(
    resolveUserPermissionProfile(user),
  );
  return effective.includes("editDiscoverySettings");
}

export function sanitizeDiscoveryReportForReader(
  user: SessionUser,
  report: DiscoveryReport,
): DiscoveryReport {
  if (canEditDiscoverySettings(user)) {
    return report;
  }

  const discoverySettings = sanitizeDiscoverySettingsForReader(
    report.discoverySettings,
  );

  return {
    ...report,
    discoverySettings,
    rows: report.rows.map((row) => {
      if (!SENSITIVE_EXCLUSION_REASONS.has(row.exclusionReason)) {
        return row;
      }
      return {
        ...row,
        title: "Restricted page",
        publicPath: "—",
        absoluteUrl: undefined,
      };
    }),
  };
}

function sanitizeDiscoverySettingsForReader(
  settings: DiscoverySettings,
): DiscoverySettings {
  return {
    sitemapMode: settings.sitemapMode,
    robotsMode: settings.robotsMode,
    llmsMode: settings.llmsMode,
    discourageSearchEngines: settings.discourageSearchEngines,
    includeSitemapInRobots: settings.includeSitemapInRobots,
    trailingSlashPolicy: settings.trailingSlashPolicy,
    aiBotPolicy: settings.aiBotPolicy,
    sitemapPingOnPublish: settings.sitemapPingOnPublish,
  };
}
