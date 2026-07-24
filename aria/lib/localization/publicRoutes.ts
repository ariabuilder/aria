import {
  LocaleCodeSchema,
  type ContentLocalizationSettings,
} from "./contentLocale";

const RESERVED_PUBLIC_ROOT_SEGMENTS = new Set([
  "admin",
  "_actions",
  "api",
  "uploads",
  "_astro",
  "robots.txt",
  "sitemap.xml",
  "sitemap-images.xml",
  "feed.xml",
  "llms.txt",
  "llms-full.txt",
  "mcp",
]);

export type ResolvedPublicLocalePath = {
  locale: string;
  /** Path without the optional locale prefix and always beginning with `/`. */
  pathname: string;
  prefixed: boolean;
  /** Canonical default-locale destination for a redundant default prefix. */
  redirectPathname: string | null;
};

function normalizePathname(pathname: string): string {
  const path = pathname.trim() || "/";
  if (!path.startsWith("/")) return `/${path}`;
  return path;
}

function firstPathSegment(pathname: string): string | null {
  const [segment] = pathname.slice(1).split("/", 1);
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function withoutFirstPathSegment(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length <= 1 ? "/" : `/${segments.slice(1).join("/")}`;
}

function configuredEnabledLocale(
  settings: ContentLocalizationSettings,
  candidate: string | null,
): string | null {
  if (
    !candidate ||
    RESERVED_PUBLIC_ROOT_SEGMENTS.has(candidate.toLowerCase())
  ) {
    return null;
  }
  const parsed = LocaleCodeSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const locale = settings.locales.find(
    (item) => item.enabled && item.code === parsed.data,
  );
  return locale?.code ?? null;
}

/**
 * Resolves the site's prefix-except-default locale path contract without
 * consulting route storage. Callers use `pathname` for page/CMS route lookup.
 */
export function resolvePublicLocalePath(input: {
  pathname: string;
  settings: ContentLocalizationSettings;
}): ResolvedPublicLocalePath {
  const pathname = normalizePathname(input.pathname);
  const candidate = configuredEnabledLocale(
    input.settings,
    firstPathSegment(pathname),
  );
  if (!candidate) {
    return {
      locale: input.settings.defaultLocale,
      pathname,
      prefixed: false,
      redirectPathname: null,
    };
  }
  const unprefixed = withoutFirstPathSegment(pathname);
  return {
    locale: candidate,
    pathname: unprefixed,
    prefixed: true,
    redirectPathname:
      candidate === input.settings.defaultLocale ? unprefixed : null,
  };
}

/** Builds the canonical public path for an explicit enabled locale. */
export function localizePublicPath(input: {
  pathname: string;
  locale: string;
  settings: ContentLocalizationSettings;
}): string {
  const parsed = LocaleCodeSchema.parse(input.locale);
  const configured = input.settings.locales.find(
    (item) => item.enabled && item.code === parsed,
  );
  if (!configured) {
    throw new Error(`Locale is not enabled for public routing: ${parsed}`);
  }
  const pathname = normalizePathname(input.pathname);
  if (parsed === input.settings.defaultLocale) return pathname;
  return pathname === "/" ? `/${parsed}` : `/${parsed}${pathname}`;
}

/** Turns a resolved public path into the absolute URL emitted in metadata. */
export function toAbsolutePublicUrl(pathname: string, baseUrl: string): string {
  return new URL(normalizePathname(pathname), baseUrl).toString();
}

/**
 * Locale canonical URLs are derived from the route resolver, never accepted
 * from a translation snapshot.
 */
export function resolveLocalizedCanonicalUrl(input: {
  pathname: string;
  locale: string;
  settings: ContentLocalizationSettings;
  baseUrl: string;
}): string {
  return toAbsolutePublicUrl(
    localizePublicPath({
      pathname: input.pathname,
      locale: input.locale,
      settings: input.settings,
    }),
    input.baseUrl,
  );
}

/** True only when an optional configured canonical resolves to this route. */
export function isSelfCanonicalPublicUrl(input: {
  canonical: string | null | undefined;
  pathname: string;
  baseUrl: string;
}): boolean {
  const configured = input.canonical?.trim();
  if (!configured) return true;
  try {
    return (
      new URL(configured, input.baseUrl).toString() ===
      toAbsolutePublicUrl(input.pathname, input.baseUrl)
    );
  } catch {
    return false;
  }
}

export function isReservedPublicLocalePath(pathname: string): boolean {
  const segment = firstPathSegment(normalizePathname(pathname));
  return Boolean(
    segment && RESERVED_PUBLIC_ROOT_SEGMENTS.has(segment.toLowerCase()),
  );
}
