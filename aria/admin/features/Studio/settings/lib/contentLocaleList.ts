import type { ContentLocaleDefinition } from "../../../../../lib/localization/contentLocale";

/**
 * Append a locale only when its code is not already present. Picker
 * components can emit the same selection more than once before their.
 */
export function addContentLocaleIfMissing(
  locales: ContentLocaleDefinition[],
  locale: ContentLocaleDefinition,
): boolean {
  if (locales.some((candidate) => candidate.code === locale.code)) return false;
  locales.push(locale);
  return true;
}
