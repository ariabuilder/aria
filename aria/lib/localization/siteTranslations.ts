import {
  normalizeContentLocalization,
  LocaleCodeSchema,
} from "./contentLocale";
import { isReservedPublicLocalePath, localizePublicPath } from "./publicRoutes";
import {
  assertLocalizedSnapshot,
  type LocalizableDsl,
} from "./translationManifest";
import type { StorageAdapter } from "../storage/adapter";
import { matchCmsUrlPattern } from "../cms/routing";
import type {
  CacheInvalidationJob,
  LayoutLocaleMeta,
  LayoutLocaleVersion,
  PageLocaleMeta,
  PageLocaleVersion,
} from "./siteTranslationSchemas";

const LEASE_DURATION_MS = 30_000;

export class SiteTranslationServiceError extends Error {
  constructor(
    readonly code:
      | "LOCALE_DISABLED"
      | "DEFAULT_LOCALE"
      | "SOURCE_NOT_FOUND"
      | "SOURCE_NOT_PUBLISHED"
      | "TRANSLATION_OUTDATED"
      | "TRANSLATION_INVALID"
      | "ROUTE_INVALID"
      | "ROUTE_LOCKED"
      | "VERSION_CONFLICT"
      | "ROUTE_CONFLICT"
      | "TRANSLATION_NOT_FOUND"
      | "TRANSLATION_PUBLISHED"
      | "ANCESTOR_TRANSLATION_REQUIRED"
      | "SYSTEM_ROLE_CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error("Secure random UUID generation is unavailable.");
  return id;
}

function expiresAt(now: string): string {
  return new Date(Date.parse(now) + LEASE_DURATION_MS).toISOString();
}

function toServiceError(error: unknown): never {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    const code = (error as { code: string }).code;
    if (
      code === "VERSION_CONFLICT" ||
      code === "ROUTE_CONFLICT" ||
      code === "TRANSLATION_NOT_FOUND" ||
      code === "TRANSLATION_PUBLISHED"
    ) {
      throw new SiteTranslationServiceError(code, error.message);
    }
  }
  throw error;
}

async function assertTranslatableLocale(
  adapter: StorageAdapter,
  requestedLocale: string,
): Promise<string> {
  const locale = LocaleCodeSchema.parse(requestedLocale);
  const settings = normalizeContentLocalization(
    (await adapter.getSiteSettings())?.localization?.content,
  );
  if (locale === settings.defaultLocale) {
    throw new SiteTranslationServiceError(
      "DEFAULT_LOCALE",
      "The default locale is stored in the canonical page and layout records.",
    );
  }
  if (!settings.locales.some((item) => item.code === locale && item.enabled)) {
    throw new SiteTranslationServiceError(
      "LOCALE_DISABLED",
      "This locale is not enabled for site localization.",
    );
  }
  return locale;
}

/**
 * Page route claims are only one of several public route owners. Check
 * the public, locale-prefixed form before taking a draft claim so a.
 */
async function assertLocalizedRouteIsAvailable(input: {
  adapter: StorageAdapter;
  locale: string;
  route: { pathname: string; pathnameKey: string };
}): Promise<void> {
  const settings = normalizeContentLocalization(
    (await input.adapter.getSiteSettings())?.localization?.content,
  );
  const publicPath = localizePublicPath({
    pathname: input.route.pathname,
    locale: input.locale,
    settings,
  });
  const publicKey = normalizeLocalizedRoute(publicPath).pathnameKey;
  const redirects = await input.adapter.listRedirects({
    includeDisabled: false,
  });
  if (
    redirects.some((redirect) => {
      try {
        return (
          normalizeLocalizedRoute(redirect.fromPath).pathnameKey === publicKey
        );
      } catch {
        return false;
      }
    })
  ) {
    throw new SiteTranslationServiceError(
      "ROUTE_CONFLICT",
      "Localized route conflicts with an enabled redirect source.",
    );
  }

  const collections = await input.adapter.listCollections();
  const collision = collections.find(
    (collection) =>
      collection.templatePageId &&
      collection.urlPattern &&
      matchCmsUrlPattern(collection.urlPattern, input.route.pathname) !== null,
  );
  if (collision) {
    throw new SiteTranslationServiceError(
      "ROUTE_CONFLICT",
      `Localized route conflicts with the ${collision.label} CMS URL pattern.`,
    );
  }
}

async function assertAncestorDraftRoutes(input: {
  adapter: StorageAdapter;
  pageId: string;
  locale: string;
}): Promise<void> {
  const pages = await input.adapter.listPagesDSL({ limit: 1_000 });
  const pageBySlug = new Map(
    pages.filter((page) => page.slug).map((page) => [page.slug!, page]),
  );
  let current = pages.find((page) => page.id === input.pageId) ?? null;
  const visited = new Set<string>();
  while (current?.parent) {
    const parent =
      pageBySlug.get(current.parent) ??
      pages.find((page) => page.id === current!.parent) ??
      null;
    if (!parent || visited.has(parent.id)) {
      throw new SiteTranslationServiceError(
        "ANCESTOR_TRANSLATION_REQUIRED",
        "Localized page ancestry is incomplete or cyclic.",
      );
    }
    visited.add(parent.id);
    const route = await input.adapter.getPageLocaleRoute(
      parent.id,
      input.locale,
    );
    if (!route?.draftClaim) {
      throw new SiteTranslationServiceError(
        "ANCESTOR_TRANSLATION_REQUIRED",
        `Translate the parent page '${parent.title || parent.slug || parent.id}' before this child.`,
      );
    }
    current = parent;
  }
}

async function assertAncestorPublishedRoutes(input: {
  adapter: StorageAdapter;
  pageId: string;
  locale: string;
}): Promise<void> {
  const pages = await input.adapter.listPagesDSL({ limit: 1_000 });
  const pageBySlug = new Map(
    pages.filter((page) => page.slug).map((page) => [page.slug!, page]),
  );
  let current = pages.find((page) => page.id === input.pageId) ?? null;
  const visited = new Set<string>();
  while (current?.parent) {
    const parent =
      pageBySlug.get(current.parent) ??
      pages.find((page) => page.id === current!.parent) ??
      null;
    if (!parent || visited.has(parent.id)) {
      throw new SiteTranslationServiceError(
        "ANCESTOR_TRANSLATION_REQUIRED",
        "Localized page ancestry is incomplete or cyclic.",
      );
    }
    visited.add(parent.id);
    const routes = await input.adapter.listPublishedPageLocaleRoutes(parent.id);
    if (!routes.some((route) => route.locale === input.locale)) {
      throw new SiteTranslationServiceError(
        "ANCESTOR_TRANSLATION_REQUIRED",
        `Publish the parent page '${parent.title || parent.slug || parent.id}' before this child.`,
      );
    }
    current = parent;
  }
}

function collectDescendantPageIds(
  pages: Awaited<ReturnType<StorageAdapter["listPagesDSL"]>>,
  rootPageId: string,
): Set<string> {
  const root = pages.find((page) => page.id === rootPageId);
  if (!root) return new Set();
  const descendants = new Set<string>();
  const pending = [rootPageId];
  while (pending.length > 0) {
    const parentId = pending.shift()!;
    const parent = pages.find((page) => page.id === parentId);
    const parentAliases = new Set(
      [parent?.id, parent?.slug].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    );
    for (const page of pages) {
      if (
        page.id !== rootPageId &&
        !descendants.has(page.id) &&
        typeof page.parent === "string" &&
        parentAliases.has(page.parent)
      ) {
        descendants.add(page.id);
        pending.push(page.id);
      }
    }
  }
  return descendants;
}

async function resolveDescendantDraftRouteMoves(input: {
  adapter: StorageAdapter;
  pageId: string;
  locale: string;
  previousRoute: { pathname: string; pathnameKey: string };
  nextRoute: { pathname: string; pathnameKey: string };
}): Promise<
  Array<{
    pageId: string;
    route: { pathname: string; pathnameKey: string };
  }>
> {
  if (input.previousRoute.pathnameKey === input.nextRoute.pathnameKey) {
    return [];
  }
  const [pages, records] = await Promise.all([
    input.adapter.listPagesDSL({ limit: 1_000 }),
    input.adapter.listPageLocaleRecords(),
  ]);
  const descendantIds = collectDescendantPageIds(pages, input.pageId);
  const moves: Array<{
    pageId: string;
    route: { pathname: string; pathnameKey: string };
  }> = [];
  const oldPrefix =
    input.previousRoute.pathname === "/"
      ? "/"
      : `${input.previousRoute.pathname}/`;
  for (const record of records) {
    if (
      record.meta.locale !== input.locale ||
      !descendantIds.has(record.meta.pageId)
    ) {
      continue;
    }
    const draftRoute = record.routes.find((route) => route.draftClaim);
    if (!draftRoute) continue;
    if (!draftRoute.pathname.startsWith(oldPrefix)) {
      throw new SiteTranslationServiceError(
        "ROUTE_CONFLICT",
        "A localized descendant route is not aligned with its parent route.",
      );
    }
    const suffix =
      input.previousRoute.pathname === "/"
        ? draftRoute.pathname.slice(1)
        : draftRoute.pathname.slice(input.previousRoute.pathname.length + 1);
    const pathname =
      input.nextRoute.pathname === "/"
        ? `/${suffix}`
        : `${input.nextRoute.pathname}/${suffix}`;
    moves.push({
      pageId: record.meta.pageId,
      route: normalizeLocalizedRoute(pathname),
    });
  }
  const routeOwners = new Map<string, string>();
  for (const move of moves) {
    const owner = routeOwners.get(move.route.pathnameKey);
    if (owner && owner !== move.pageId) {
      throw new SiteTranslationServiceError(
        "ROUTE_CONFLICT",
        "Localized descendant routes would collide after the parent move.",
      );
    }
    routeOwners.set(move.route.pathnameKey, move.pageId);
    await assertLocalizedRouteIsAvailable({
      adapter: input.adapter,
      locale: input.locale,
      route: move.route,
    });
  }
  return moves;
}

async function resolveDescendantPublishedRouteMoves(input: {
  adapter: StorageAdapter;
  pageId: string;
  locale: string;
  parentDraftPathname: string;
}): Promise<Array<{ pageId: string; pathnameKey: string }>> {
  const [pages, records] = await Promise.all([
    input.adapter.listPagesDSL({ limit: 1_000 }),
    input.adapter.listPageLocaleRecords(),
  ]);
  const descendantIds = collectDescendantPageIds(pages, input.pageId);
  const prefix =
    input.parentDraftPathname === "/"
      ? "/"
      : `${input.parentDraftPathname}/`;
  const moves: Array<{ pageId: string; pathnameKey: string }> = [];
  for (const record of records) {
    if (
      record.meta.locale !== input.locale ||
      !descendantIds.has(record.meta.pageId)
    ) {
      continue;
    }
    const publishedRoute = record.routes.find((route) => route.publishedClaim);
    if (!publishedRoute) continue;
    const draftRoute = record.routes.find((route) => route.draftClaim);
    if (!draftRoute || !draftRoute.pathname.startsWith(prefix)) {
      throw new SiteTranslationServiceError(
        "ROUTE_CONFLICT",
        "A published localized descendant cannot move with the parent route.",
      );
    }
    moves.push({
      pageId: record.meta.pageId,
      pathnameKey: draftRoute.pathnameKey,
    });
  }
  return moves;
}

/** Normalizes a locale-internal route and derives its collision key. */
export function normalizeLocalizedRoute(pathname: string): {
  pathname: string;
  pathnameKey: string;
} {
  if (
    pathname.includes("?") ||
    pathname.includes("#") ||
    !pathname.startsWith("/")
  ) {
    throw new SiteTranslationServiceError(
      "ROUTE_INVALID",
      "Localized routes must be absolute paths without a query or fragment.",
    );
  }
  const segments = pathname.split("/").slice(1);
  const normalizedSegments: string[] = [];
  for (const rawSegment of segments) {
    if (!rawSegment) continue;
    let segment: string;
    try {
      segment = decodeURIComponent(rawSegment).normalize("NFC");
    } catch {
      throw new SiteTranslationServiceError(
        "ROUTE_INVALID",
        "Localized route contains an invalid escape sequence.",
      );
    }
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/")
    ) {
      throw new SiteTranslationServiceError(
        "ROUTE_INVALID",
        "Localized route contains an unsafe path segment.",
      );
    }
    normalizedSegments.push(encodeURIComponent(segment));
  }
  const normalized = `/${normalizedSegments.join("/")}`;
  if (normalized.length > 2_048 || isReservedPublicLocalePath(normalized)) {
    throw new SiteTranslationServiceError(
      "ROUTE_INVALID",
      "Localized route is reserved or too long.",
    );
  }
  return {
    pathname: normalized,
    pathnameKey: normalized.toLocaleLowerCase("und"),
  };
}

async function withLocaleLease<T>(
  adapter: StorageAdapter,
  locale: string,
  operation: () => Promise<T>,
): Promise<T> {
  const now = nowIso();
  const leaseToken = randomId();
  const lease = await adapter.acquireLocaleRouteLease({
    locale,
    leaseToken,
    now,
    expiresAt: expiresAt(now),
    updatedAt: now,
  });
  if (!lease) {
    throw new SiteTranslationServiceError(
      "ROUTE_LOCKED",
      "Another localization change is in progress for this locale. Please retry.",
    );
  }
  try {
    return await operation();
  } finally {
    await adapter.releaseLocaleRouteLease({ locale, leaseToken });
  }
}

function invalidationJob(input: {
  resourceType: "page" | "layout";
  resourceId: string;
  locale: string;
  version: string | null;
  operation: "publish" | "unpublish";
  now: string;
  affectedPageIds?: readonly string[];
}): CacheInvalidationJob {
  const idempotencyKey = [
    "localization",
    input.operation,
    input.resourceType,
    input.resourceId,
    input.locale,
    input.version ?? "none",
  ].join(":");
  return {
    id: randomId(),
    idempotencyKey,
    scope: input.resourceType === "page" ? "public-route" : "discovery",
    payload: {
      reason: "site-localization",
      operation: input.operation,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      ...(input.affectedPageIds?.length
        ? { resourceIds: [...new Set(input.affectedPageIds)] }
        : {}),
      locale: input.locale,
      version: input.version,
    },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: input.now,
    leaseToken: null,
    leaseExpiresAt: null,
    lastError: null,
    createdAt: input.now,
    updatedAt: input.now,
    completedAt: null,
  };
}

export async function savePageTranslation(
  adapter: StorageAdapter,
  input: {
    version: PageLocaleVersion;
    expectedCurrentVersion?: string | null;
    pathname?: string | null;
  },
): Promise<PageLocaleMeta> {
  const locale = await assertTranslatableLocale(adapter, input.version.locale);
  const policy = await adapter.getPagePolicy(input.version.pageId);
  const ownsRoute = !policy || policy.systemRole === "standard";
  if (!ownsRoute && input.pathname) {
    throw new SiteTranslationServiceError(
      "SYSTEM_ROLE_CONFLICT",
      "Only standard pages may own a localized public route.",
    );
  }
  if (
    !(await adapter.getPageDSL(
      input.version.pageId,
      input.version.sourceVersion,
    ))
  ) {
    throw new SiteTranslationServiceError(
      "SOURCE_NOT_FOUND",
      "The canonical source page version no longer exists.",
    );
  }
  if (
    input.version.layoutId &&
    !(await adapter.getLayoutDSL(
      input.version.layoutId,
      input.version.fallbackLayoutVersion!,
    ))
  ) {
    throw new SiteTranslationServiceError(
      "SOURCE_NOT_FOUND",
      "The pinned canonical layout version no longer exists.",
    );
  }
  const source = await adapter.getPageDSL(
    input.version.pageId,
    input.version.sourceVersion,
  );
  if (!source) {
    throw new SiteTranslationServiceError(
      "SOURCE_NOT_FOUND",
      "The canonical source page version no longer exists.",
    );
  }
  try {
    assertLocalizedSnapshot({
      source,
      candidate: input.version.dsl as unknown as LocalizableDsl,
      translatedPaths: input.version.translatedPaths,
      sourceManifestHash: input.version.sourceManifestHash,
      sourceStructureHash: input.version.sourceStructureHash,
    });
  } catch (error) {
    throw new SiteTranslationServiceError(
      "TRANSLATION_INVALID",
      error instanceof Error ? error.message : "Localized draft is invalid.",
    );
  }
  const route = input.pathname ? normalizeLocalizedRoute(input.pathname) : null;
  try {
    return await withLocaleLease(adapter, locale, async () => {
      const previousRoute = await adapter.getPageLocaleRoute(
        input.version.pageId,
        locale,
      );
      let draftRouteMoves: Array<{
        pageId: string;
        route: { pathname: string; pathnameKey: string };
      }> = [];
      if (route) {
        await assertAncestorDraftRoutes({
          adapter,
          pageId: input.version.pageId,
          locale,
        });
        await assertLocalizedRouteIsAvailable({ adapter, locale, route });
        if (previousRoute) {
          draftRouteMoves = await resolveDescendantDraftRouteMoves({
            adapter,
            pageId: input.version.pageId,
            locale,
            previousRoute,
            nextRoute: route,
          });
        }
      }
      return adapter.savePageLocaleDraft({
        version: { ...input.version, locale },
        expectedCurrentVersion: input.expectedCurrentVersion,
        updatedAt: nowIso(),
        ...(route ? { route } : {}),
        ...(draftRouteMoves.length > 0 ? { draftRouteMoves } : {}),
      });
    });
  } catch (error) {
    return toServiceError(error);
  }
}

export async function publishPageTranslation(
  adapter: StorageAdapter,
  input: { pageId: string; locale: string; expectedCurrentVersion: string },
): Promise<PageLocaleMeta> {
  const locale = await assertTranslatableLocale(adapter, input.locale);
  const policy = await adapter.getPagePolicy(input.pageId);
  if (!policy || policy.systemRole === "standard") {
    await assertAncestorPublishedRoutes({
      adapter,
      pageId: input.pageId,
      locale,
    });
  }
  const pins = await adapter.getPageVersionPins(input.pageId);
  if (!pins?.publishedVersion) {
    throw new SiteTranslationServiceError(
      "SOURCE_NOT_PUBLISHED",
      "The canonical page must be published before a locale translation can publish.",
    );
  }
  const localeMeta = await adapter.getPageLocaleMeta(input.pageId, locale);
  const localeVersion = localeMeta
    ? await adapter.getPageLocaleVersion(
        input.pageId,
        locale,
        input.expectedCurrentVersion,
      )
    : null;
  if (!localeVersion) {
    throw new SiteTranslationServiceError(
      "TRANSLATION_NOT_FOUND",
      "Localized page draft was not found.",
    );
  }
  if (localeVersion.sourceVersion !== pins.publishedVersion) {
    throw new SiteTranslationServiceError(
      "TRANSLATION_OUTDATED",
      "Refresh this translation from the canonical published page before publishing it.",
    );
  }
  const now = nowIso();
  try {
    return await withLocaleLease(adapter, locale, async () => {
      let publishedRouteMoves: Array<{ pageId: string; pathnameKey: string }> =
        [];
      if (!policy || policy.systemRole === "standard") {
        const records = await adapter.listPageLocaleRecords();
        const parentRecord = records.find(
          (record) =>
            record.meta.pageId === input.pageId && record.meta.locale === locale,
        );
        const draftRoute = parentRecord?.routes.find(
          (route) => route.draftClaim,
        );
        const publishedRoute = parentRecord?.routes.find(
          (route) => route.publishedClaim,
        );
        if (
          draftRoute &&
          publishedRoute &&
          draftRoute.pathnameKey !== publishedRoute.pathnameKey
        ) {
          publishedRouteMoves = await resolveDescendantPublishedRouteMoves({
            adapter,
            pageId: input.pageId,
            locale,
            parentDraftPathname: draftRoute.pathname,
          });
        }
      }
      return adapter.publishPageLocaleDraft({
        ...input,
        locale,
        requiresRoute: !policy || policy.systemRole === "standard",
        ...(publishedRouteMoves.length > 0 ? { publishedRouteMoves } : {}),
        publishedAt: now,
        invalidationJob: invalidationJob({
          resourceType: "page",
          resourceId: input.pageId,
          affectedPageIds: [
            input.pageId,
            ...publishedRouteMoves.map((move) => move.pageId),
          ],
          locale,
          version: input.expectedCurrentVersion,
          operation: "publish",
          now,
        }),
      });
    });
  } catch (error) {
    return toServiceError(error);
  }
}

export async function unpublishPageTranslation(
  adapter: StorageAdapter,
  input: { pageId: string; locale: string },
): Promise<PageLocaleMeta | null> {
  const locale = await assertTranslatableLocale(adapter, input.locale);
  const current = await adapter.getPageLocaleMeta(input.pageId, locale);
  if (!current) return null;
  const now = nowIso();
  try {
    return await withLocaleLease(adapter, locale, () =>
      adapter.unpublishPageLocale({
        ...input,
        locale,
        updatedAt: now,
        invalidationJob: invalidationJob({
          resourceType: "page",
          resourceId: input.pageId,
          locale,
          version: current.publishedVersion,
          operation: "unpublish",
          now,
        }),
      }),
    );
  } catch (error) {
    return toServiceError(error);
  }
}

export async function deletePageTranslation(
  adapter: StorageAdapter,
  input: { pageId: string; locale: string; expectedCurrentVersion: string },
): Promise<void> {
  const locale = await assertTranslatableLocale(adapter, input.locale);
  try {
    await withLocaleLease(adapter, locale, () =>
      adapter.deletePageLocale({ ...input, locale }),
    );
  } catch (error) {
    return toServiceError(error);
  }
}

export async function saveLayoutTranslation(
  adapter: StorageAdapter,
  input: {
    version: LayoutLocaleVersion;
    expectedCurrentVersion?: string | null;
  },
): Promise<LayoutLocaleMeta> {
  const locale = await assertTranslatableLocale(adapter, input.version.locale);
  if (
    !(await adapter.getLayoutDSL(
      input.version.layoutId,
      input.version.sourceVersion,
    ))
  ) {
    throw new SiteTranslationServiceError(
      "SOURCE_NOT_FOUND",
      "The canonical source layout version no longer exists.",
    );
  }
  const source = await adapter.getLayoutDSL(
    input.version.layoutId,
    input.version.sourceVersion,
  );
  if (!source) {
    throw new SiteTranslationServiceError(
      "SOURCE_NOT_FOUND",
      "The canonical source layout version no longer exists.",
    );
  }
  try {
    assertLocalizedSnapshot({
      source,
      candidate: input.version.dsl as unknown as LocalizableDsl,
      translatedPaths: input.version.translatedPaths,
      sourceManifestHash: input.version.sourceManifestHash,
      sourceStructureHash: input.version.sourceStructureHash,
    });
  } catch (error) {
    throw new SiteTranslationServiceError(
      "TRANSLATION_INVALID",
      error instanceof Error ? error.message : "Localized draft is invalid.",
    );
  }
  try {
    return await withLocaleLease(adapter, locale, () =>
      adapter.saveLayoutLocaleDraft({
        version: { ...input.version, locale },
        expectedCurrentVersion: input.expectedCurrentVersion,
        updatedAt: nowIso(),
      }),
    );
  } catch (error) {
    return toServiceError(error);
  }
}

export async function publishLayoutTranslation(
  adapter: StorageAdapter,
  input: { layoutId: string; locale: string; expectedCurrentVersion: string },
): Promise<LayoutLocaleMeta> {
  const locale = await assertTranslatableLocale(adapter, input.locale);
  const pins = await adapter.getLayoutVersionPins(input.layoutId);
  const localeMeta = await adapter.getLayoutLocaleMeta(input.layoutId, locale);
  const localeVersion = localeMeta
    ? await adapter.getLayoutLocaleVersion(
        input.layoutId,
        locale,
        input.expectedCurrentVersion,
      )
    : null;
  if (!localeVersion) {
    throw new SiteTranslationServiceError(
      "TRANSLATION_NOT_FOUND",
      "Localized layout draft was not found.",
    );
  }
  if (!pins || localeVersion.sourceVersion !== pins.currentVersion) {
    throw new SiteTranslationServiceError(
      "TRANSLATION_OUTDATED",
      "Refresh this translation from the canonical current layout before publishing it.",
    );
  }
  const now = nowIso();
  try {
    return await withLocaleLease(adapter, locale, () =>
      adapter.publishLayoutLocaleDraft({
        ...input,
        locale,
        publishedAt: now,
        invalidationJob: invalidationJob({
          resourceType: "layout",
          resourceId: input.layoutId,
          locale,
          version: input.expectedCurrentVersion,
          operation: "publish",
          now,
        }),
      }),
    );
  } catch (error) {
    return toServiceError(error);
  }
}

export async function unpublishLayoutTranslation(
  adapter: StorageAdapter,
  input: { layoutId: string; locale: string },
): Promise<LayoutLocaleMeta | null> {
  const locale = await assertTranslatableLocale(adapter, input.locale);
  const current = await adapter.getLayoutLocaleMeta(input.layoutId, locale);
  if (!current) return null;
  const now = nowIso();
  try {
    return await withLocaleLease(adapter, locale, () =>
      adapter.unpublishLayoutLocale({
        ...input,
        locale,
        updatedAt: now,
        invalidationJob: invalidationJob({
          resourceType: "layout",
          resourceId: input.layoutId,
          locale,
          version: current.publishedVersion,
          operation: "unpublish",
          now,
        }),
      }),
    );
  } catch (error) {
    return toServiceError(error);
  }
}

export async function deleteLayoutTranslation(
  adapter: StorageAdapter,
  input: { layoutId: string; locale: string; expectedCurrentVersion: string },
): Promise<void> {
  const locale = await assertTranslatableLocale(adapter, input.locale);
  try {
    await withLocaleLease(adapter, locale, () =>
      adapter.deleteLayoutLocale({ ...input, locale }),
    );
  } catch (error) {
    return toServiceError(error);
  }
}
