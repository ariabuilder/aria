import type { StoredPageAccessMode } from "../storage/adapter";

export interface RobotsDirectiveInput {
  noindex?: boolean;
  nofollow?: boolean;
}

export interface ResolvePageRobotsMetaInput {
  accessMode?: StoredPageAccessMode;
  seo?: {
    noindex?: boolean;
    nofollow?: boolean;
  };
}

/** Returns "noindex", "nofollow", "noindex, nofollow", or null (index, follow). */
export function buildRobotsMetaContent(
  input: RobotsDirectiveInput,
): string | null {
  const parts: string[] = [];
  if (input.noindex) {
    parts.push("noindex");
  }
  if (input.nofollow) {
    parts.push("nofollow");
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Full tag or empty string. */
export function buildRobotsMetaTag(input: RobotsDirectiveInput): string {
  const content = buildRobotsMetaContent(input);
  if (!content) {
    return "";
  }
  return `<meta name="robots" content="${content}" />`;
}

/**
 * Merges access policy (always wins for password/unlisted/private) with page SEO flags.
 */
export function resolvePageRobotsMeta(
  input: ResolvePageRobotsMetaInput,
): RobotsDirectiveInput {
  const accessMode = input.accessMode ?? "public";

  if (
    accessMode === "password" ||
    accessMode === "private" ||
    accessMode === "unlisted"
  ) {
    return { noindex: true, nofollow: true };
  }

  return {
    ...(input.seo?.noindex ? { noindex: true } : {}),
    ...(input.seo?.nofollow ? { nofollow: true } : {}),
  };
}
