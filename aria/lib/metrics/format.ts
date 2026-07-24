/**
 * Display formatting for traffic metrics.
 */

export function formatCompactCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "0";
  }
  if (value >= 1_000_000) {
    const scaled = value / 1_000_000;
    return scaled >= 10 ? `${Math.round(scaled)}M` : `${scaled.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const scaled = value / 1_000;
    return scaled >= 10 ? `${Math.round(scaled)}k` : `${scaled.toFixed(1)}k`;
  }
  return String(Math.round(value));
}

export function formatBandwidthBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded =
    value >= 10 || unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}
