import {
  matchCmsUrlPattern,
  validateCmsUrlPattern,
} from "./routing";

export function buildCmsEntryPublicPath(
  urlPattern: string,
  entrySlug: string,
): string | null {
  const validation = validateCmsUrlPattern(urlPattern);
  if (!validation.valid) {
    return null;
  }

  const pathname = urlPattern.replace("{slug}", entrySlug);
  const matchedSlug = matchCmsUrlPattern(urlPattern, pathname);
  if (matchedSlug !== entrySlug) {
    return null;
  }

  return pathname;
}
