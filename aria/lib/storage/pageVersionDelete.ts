/**
 * Guards for deleting a single page version row.
 */

export type PageVersionPins = {
  draftVersion: string | null;
  publishedVersion: string | null;
  currentVersion: string;
};

export function normalizeStoredVersion(version: string): string {
  return version.startsWith("v") ? version.slice(1) : version;
}

export function collectProtectedPageVersions(pins: PageVersionPins): Set<string> {
  const protectedVersions = new Set<string>();
  for (const value of [
    pins.draftVersion,
    pins.publishedVersion,
    pins.currentVersion,
  ]) {
    if (value && value.trim().length > 0) {
      protectedVersions.add(normalizeStoredVersion(value));
    }
  }
  return protectedVersions;
}

export function assertPageVersionDeletable(input: {
  version: string;
  pins: PageVersionPins;
  existingVersions: readonly string[];
}): string {
  const normalizedTarget = normalizeStoredVersion(input.version.trim());
  if (!normalizedTarget) {
    throw new Error("Invalid version id");
  }

  if (input.existingVersions.length <= 1) {
    throw new Error("Cannot delete the only remaining revision for this page.");
  }

  const exists = input.existingVersions.some(
    (entry) => normalizeStoredVersion(entry) === normalizedTarget,
  );
  if (!exists) {
    throw new Error(`Version "${input.version}" not found for this page.`);
  }

  const protectedVersions = collectProtectedPageVersions(input.pins);
  if (protectedVersions.has(normalizedTarget)) {
    throw new Error(
      "This revision is protected and cannot be deleted (current, draft, or published).",
    );
  }

  return normalizedTarget;
}
