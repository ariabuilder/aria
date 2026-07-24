/**
 * Client-safe page layout helpers.
 */

export function normalizePageLayoutRef(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
