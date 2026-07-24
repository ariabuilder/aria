import { cmsUrlPatternParts } from "../cms/routing";
import { buildStudioPagePathMap } from "../pages/publicPaths";
import type { StorageAdapter } from "../storage/adapter";
import type { ContentLocalizationSettings } from "./contentLocale";
import type { CacheInvalidationJob } from "./siteTranslationSchemas";

function firstSegment(pathname: string): string | null {
  const segment = pathname.trim().replace(/^\/+/, "").split("/")[0];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment)
      .normalize("NFC")
      .toLocaleLowerCase("und");
  } catch {
    return segment.toLocaleLowerCase("und");
  }
}

function isLocaleRoot(pathname: string, locale: string): boolean {
  return firstSegment(pathname) === locale.toLocaleLowerCase("und");
}

function collectionPatternUsesLocaleRoot(
  pattern: string,
  locale: string,
): boolean {
  const parts = cmsUrlPatternParts(pattern);
  const first = parts[0];
  return (
    first?.toLocaleLowerCase("und") === locale.toLocaleLowerCase("und") ||
    first === "{slug}"
  );
}

/**
 * Enabling `fr` changes the meaning of every `/fr/.. ` request.
 */
export async function findLocaleEnableRouteConflicts(input: {
  adapter: StorageAdapter;
  current: ContentLocalizationSettings;
  next: ContentLocalizationSettings;
}): Promise<string[]> {
  const newlyEnabled = input.next.locales.filter(
    (candidate) =>
      candidate.enabled &&
      !input.current.locales.some(
        (current) => current.code === candidate.code && current.enabled,
      ),
  );
  if (newlyEnabled.length === 0) return [];

  const [pages, collections, redirects] = await Promise.all([
    input.adapter.listPagesDSL({ limit: 1_000 }),
    input.adapter.listCollections(),
    input.adapter.listRedirects({ includeDisabled: false }),
  ]);
  const pagePaths = buildStudioPagePathMap(
    pages.map((page) => ({ slug: page.slug ?? "", parent: page.parent })),
  );
  const conflicts: string[] = [];

  for (const locale of newlyEnabled) {
    const page = pages.find((candidate) => {
      if (
        candidate.status !== "published" ||
        candidate.systemRole !== "standard"
      ) {
        return false;
      }
      const pathname = pagePaths.get(candidate.slug ?? "");
      return pathname ? isLocaleRoot(pathname, locale.code) : false;
    });
    if (page) {
      conflicts.push(
        `Published page '${page.title || page.slug || page.id}' already owns the /${locale.code} route prefix.`,
      );
    }

    const collection = collections.find(
      (candidate) =>
        candidate.templatePageId &&
        candidate.urlPattern &&
        collectionPatternUsesLocaleRoot(candidate.urlPattern, locale.code),
    );
    if (collection) {
      conflicts.push(
        `CMS collection '${collection.label}' already owns the /${locale.code} route prefix.`,
      );
    }

    const redirect = redirects.find(
      (candidate) =>
        candidate.enabled && isLocaleRoot(candidate.fromPath, locale.code),
    );
    if (redirect) {
      conflicts.push(
        `Redirect '${redirect.fromPath}' already owns the /${locale.code} route prefix.`,
      );
    }
  }

  return conflicts;
}

/** Saved locale codes are identity keys for locale records and public URLs. */
export function findRemovedLocaleCodes(input: {
  current: ContentLocalizationSettings;
  next: ContentLocalizationSettings;
}): string[] {
  const nextCodes = new Set(input.next.locales.map((locale) => locale.code));
  return input.current.locales
    .map((locale) => locale.code)
    .filter((code) => !nextCodes.has(code));
}

/**
 * A locale may be removed only after its translated resources are
 * deleted. This keeps locale settings from orphaning page/layout versions or.
 */
export async function findLocaleRemovalConflicts(input: {
  adapter: StorageAdapter;
  current: ContentLocalizationSettings;
  next: ContentLocalizationSettings;
}): Promise<string[]> {
  const removedCodes = findRemovedLocaleCodes(input);
  if (removedCodes.length === 0) return [];

  const [pageRecords, layoutRecords] = await Promise.all([
    input.adapter.listPageLocaleRecords(),
    input.adapter.listLayoutLocaleRecords(),
  ]);

  return removedCodes.flatMap((locale) => {
    const pageCount = pageRecords.filter(
      (record) => record.meta.locale === locale,
    ).length;
    const layoutCount = layoutRecords.filter(
      (record) => record.meta.locale === locale,
    ).length;
    if (pageCount === 0 && layoutCount === 0) return [];

    const resources = [
      pageCount
        ? `${pageCount} page translation${pageCount === 1 ? "" : "s"}`
        : "",
      layoutCount
        ? `${layoutCount} layout translation${layoutCount === 1 ? "" : "s"}`
        : "",
    ]
      .filter(Boolean)
      .join(" and ");
    return [
      `Locale ${locale} cannot be removed while it has ${resources}. Delete its translations first.`,
    ];
  });
}

function jobId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error("Secure random UUID generation is unavailable.");
  return `locale-policy-${id}`;
}

/**
 * Locale state changes preserve locale records but must purge the
 * existing public materialization for every affected route. A unique.
 */
export async function buildLocalePolicyInvalidationJobs(input: {
  adapter: StorageAdapter;
  current: ContentLocalizationSettings;
  next: ContentLocalizationSettings;
  now?: string;
}): Promise<CacheInvalidationJob[]> {
  const transitions = input.next.locales.flatMap((nextLocale) => {
    const currentLocale = input.current.locales.find(
      (locale) => locale.code === nextLocale.code,
    );
    if (!currentLocale || currentLocale.enabled === nextLocale.enabled) {
      return [];
    }
    return [
      {
        locale: nextLocale.code,
        operation: nextLocale.enabled ? "enable" : "disable",
      },
    ] as const;
  });
  if (transitions.length === 0) return [];
  const now = input.now ?? new Date().toISOString();
  const transitionId = jobId();
  const pages = await input.adapter.listPagesDSL({ limit: 1_000 });
  const routeLists = await Promise.all(
    pages.map((page) => input.adapter.listPublishedPageLocaleRoutes(page.id)),
  );
  const jobs: CacheInvalidationJob[] = [];
  for (const [index, page] of pages.entries()) {
    for (const route of routeLists[index] ?? []) {
      const transition = transitions.find(
        (candidate) => candidate.locale === route.locale,
      );
      if (!transition) continue;
      jobs.push({
        id: jobId(),
        idempotencyKey: [
          "locale-policy",
          transitionId,
          transition.operation,
          route.locale,
          page.id,
          route.pathnameKey,
        ].join(":"),
        scope: "locale-policy",
        payload: {
          reason: "locale-policy",
          operation: transition.operation,
          resourceType: "page",
          resourceId: page.id,
          locale: route.locale,
          pathname: route.pathname,
        },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      });
    }
  }
  return jobs;
}
