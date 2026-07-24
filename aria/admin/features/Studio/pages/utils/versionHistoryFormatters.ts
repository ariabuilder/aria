import { formatRelativeTime } from "@/features/Core/utils/formatting";

/** Absolute timestamp for version history rows. */
export function formatVersionDateTime(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const datePart = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timePart = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${datePart} · ${timePart}`;
  } catch {
    return iso;
  }
}

/** Absolute + relative suffix for version history metadata line. */
export function formatVersionTimestampLine(iso: string): string {
  const absolute = formatVersionDateTime(iso);
  const relative = formatRelativeTime(iso);
  if (!relative) return absolute;
  return `${absolute} (${relative})`;
}

export type VersionDisplayInput = {
  version: string;
  createdAt: string;
};

/** Maps internal version ids to sequential display numbers (v1 = oldest). */
export function buildVersionDisplayNumbers(
  versions: readonly VersionDisplayInput[],
): Map<string, number> {
  const oldestFirst = [...versions].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    return byTime !== 0 ? byTime : a.version.localeCompare(b.version);
  });

  return new Map(oldestFirst.map((entry, index) => [entry.version, index + 1]));
}
