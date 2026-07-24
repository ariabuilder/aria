/**
 * Contextual authorship labels for version history (newest-first list).
 */

export type VersionAuthorshipLabel = "Created by" | "Updated by";

/**
 * Returns the label for a version row by index in a newest-first list.
 * The oldest entry (last index) is "Created by"; all others are "Updated by".
 */
export function getVersionAuthorshipLabel(
  index: number,
  total: number,
): VersionAuthorshipLabel {
  if (total <= 0) return "Updated by";
  return index === total - 1 ? "Created by" : "Updated by";
}
