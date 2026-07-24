/**
 * Date Formatting Utilities.
 */

/**
 * Format a date as relative time (e.g., "2h ago", "3d ago")
 */
export function formatRelativeTime(date: Date | string | undefined): string {
  if (!date) return "";

  const d = typeof date === "string" ? new Date(date) : date;
  const locale =
    typeof document === "undefined" ? "en" : document.documentElement.lang || "en";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return locale.startsWith("fr") ? "A l'instant" : "Just now";
  }
  if (diffMins < 60) {
    return locale.startsWith("fr") ? `Il y a ${diffMins} min` : `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return locale.startsWith("fr") ? `Il y a ${diffHours} h` : `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return locale.startsWith("fr") ? `Il y a ${diffDays} j` : `${diffDays}d ago`;
  }

  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
