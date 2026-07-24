/**
 * Version Compatibility
 *
 * Semantic version comparison and app compatibility checks.
 */

import type { PackManifest } from "./types";

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/**
 * Parse a semver string into components
 */
export function parseVersion(version: string): ParsedVersion | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/**
 * Compare two semantic versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  if (!parsedA || !parsedB) {
    // Fall back to string comparison if parsing fails
    return a.localeCompare(b);
  }

  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }

  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }

  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }

  // Prerelease versions are less than release versions
  if (parsedA.prerelease && !parsedB.prerelease) return -1;
  if (!parsedA.prerelease && parsedB.prerelease) return 1;

  // Compare prerelease strings if both present
  if (parsedA.prerelease && parsedB.prerelease) {
    return parsedA.prerelease.localeCompare(parsedB.prerelease);
  }

  return 0;
}

/**
 * Check if version A is greater than version B
 */
export function isNewerVersion(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

/**
 * Check if version A is greater than or equal to version B
 */
export function isVersionAtLeast(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0;
}

/**
 * Get the current build version injected at compile time.
 */
export function getAppVersion(): string {
  return import.meta.env?.PUBLIC_APP_VERSION ?? "1.0.0";
}

export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
  requiredVersion?: string;
  currentVersion?: string;
}

/**
 * Check if a pack is compatible with the current app version
 */
export function checkPackCompatibility(
  manifest: PackManifest,
): CompatibilityResult {
  const currentVersion = getAppVersion();

  // If no minimum version specified, assume compatible
  if (!manifest.minAppVersion) {
    return { compatible: true };
  }

  const isCompatible = isVersionAtLeast(currentVersion, manifest.minAppVersion);

  if (!isCompatible) {
    return {
      compatible: false,
      reason: `Pack "${manifest.name}" requires app version ${manifest.minAppVersion} or higher. Current version: ${currentVersion}`,
      requiredVersion: manifest.minAppVersion,
      currentVersion,
    };
  }

  return { compatible: true };
}

export function checkPacksCompatibility(
  manifests: PackManifest[],
): Map<string, CompatibilityResult> {
  const results = new Map<string, CompatibilityResult>();

  for (const manifest of manifests) {
    results.set(manifest.id, checkPackCompatibility(manifest));
  }

  return results;
}

/**
 * Filter packs to only compatible ones
 */
export function filterCompatiblePacks(
  manifests: PackManifest[],
): PackManifest[] {
  return manifests.filter((m) => checkPackCompatibility(m).compatible);
}

/**
 * Version range check (for future use with version constraints)
 * Supports basic ranges like ">=1.0.0", "^1.0.0", "~1.0.0"
 */
export function satisfiesVersionRange(version: string, range: string): boolean {
  if (
    !range.startsWith("^") &&
    !range.startsWith("~") &&
    !range.startsWith(">") &&
    !range.startsWith("<")
  ) {
    return compareVersions(version, range) === 0;
  }

  // Handle >=
  if (range.startsWith(">=")) {
    return isVersionAtLeast(version, range.slice(2));
  }

  // Handle >
  if (range.startsWith(">") && !range.startsWith(">=")) {
    return compareVersions(version, range.slice(1)) > 0;
  }

  // Handle <=
  if (range.startsWith("<=")) {
    return compareVersions(version, range.slice(2)) <= 0;
  }

  // Handle <
  if (range.startsWith("<") && !range.startsWith("<=")) {
    return compareVersions(version, range.slice(1)) < 0;
  }

  // Handle ^ (compatible with version - same major)
  if (range.startsWith("^")) {
    const rangeVersion = parseVersion(range.slice(1));
    const checkVersion = parseVersion(version);
    if (!rangeVersion || !checkVersion) return false;

    return (
      checkVersion.major === rangeVersion.major &&
      isVersionAtLeast(version, range.slice(1))
    );
  }

  // Handle ~ (approximately equivalent - same major.minor)
  if (range.startsWith("~")) {
    const rangeVersion = parseVersion(range.slice(1));
    const checkVersion = parseVersion(version);
    if (!rangeVersion || !checkVersion) return false;

    return (
      checkVersion.major === rangeVersion.major &&
      checkVersion.minor === rangeVersion.minor &&
      isVersionAtLeast(version, range.slice(1))
    );
  }

  return false;
}
