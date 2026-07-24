import { buildCmsEntryPublicPath } from "../cms/publicPaths";
import { normalizeContentLocalization } from "../localization/contentLocale";
import { localizePublicPath } from "../localization/publicRoutes";
import { buildStudioPagePathMap } from "../pages/publicPaths";
import type { StorageAdapter } from "../storage/adapter";
import type { RedirectTarget } from "./schemas";

function addTarget(
  targetsByPath: Map<string, RedirectTarget>,
  target: RedirectTarget,
): void {
  // A public path has one effective route. Keep the first target so the picker
  // stays unambiguous if invalid legacy content has overlapping routes.
  if (!targetsByPath.has(target.path)) {
    targetsByPath.set(target.path, target);
  }
}

async function hasPublishedTemplate(
  adapter: StorageAdapter,
  pageId: string,
): Promise<boolean> {
  try {
    return (await adapter.getPublishedPageDSL(pageId)) !== null;
  } catch {
    return false;
  }
}

/**
 * Lists every internal route that can be selected as a
 * redirect destination. Page targets retain the existing page-path behavior.
 */
export async function listRedirectTargets(
  adapter: StorageAdapter,
): Promise<RedirectTarget[]> {
  const [pages, collections, siteSettings] = await Promise.all([
    adapter.listPagesDSL({ limit: 1000 }),
    adapter.listCollections(),
    adapter.getSiteSettings(),
  ]);
  const localization = normalizeContentLocalization(
    siteSettings?.localization?.content,
  );
  const enabledLocales = new Set(
    localization.locales
      .filter((locale) => locale.enabled)
      .map((locale) => locale.code),
  );
  const targetsByPath = new Map<string, RedirectTarget>();
  const pathMap = buildStudioPagePathMap(
    pages.map((page) => ({ slug: page.slug ?? "", parent: page.parent })),
  );

  for (const page of pages) {
    const slug = page.slug ?? "";
    const path = pathMap.get(slug);
    if (!slug || !path) continue;
    addTarget(targetsByPath, {
      id: `page:${page.id}`,
      kind: "page",
      title: page.title || slug,
      path,
      status: page.status,
    });
  }

  const pageLocaleRoutes = await Promise.all(
    pages.map(async (page) => ({
      page,
      routes: await adapter.listPublishedPageLocaleRoutes(page.id),
    })),
  );
  for (const { page, routes } of pageLocaleRoutes) {
    for (const route of routes) {
      if (!enabledLocales.has(route.locale)) continue;
      const path = localizePublicPath({
        pathname: route.pathname,
        locale: route.locale,
        settings: localization,
      });
      addTarget(targetsByPath, {
        id: `page:${page.id}:${route.locale}`,
        kind: "page",
        title: page.title || page.slug || route.pathname,
        path,
        status: page.status,
        locale: route.locale,
      });
    }
  }

  for (const collection of collections) {
    if (!collection.urlPattern || !collection.templatePageId) continue;
    if (!(await hasPublishedTemplate(adapter, collection.templatePageId))) {
      continue;
    }

    const pageSize = 250;
    let page = 1;
    let inspected = 0;
    while (true) {
      const result = await adapter.listEntries({
        collectionId: collection.id,
        status: "published",
        limit: pageSize,
        page,
      });
      const records = await Promise.all(
        result.items.map((entry) =>
          adapter.getEntry({
            collectionId: collection.id,
            idOrSlug: entry.entry.id,
            includeAllLocales: true,
          }),
        ),
      );

      for (const record of records) {
        if (!record || record.entry.status !== "published") continue;
        for (const entryLocale of record.locales) {
          if (!enabledLocales.has(entryLocale.locale)) continue;
          const pathname = buildCmsEntryPublicPath(
            collection.urlPattern,
            entryLocale.slug,
          );
          if (!pathname) continue;
          addTarget(targetsByPath, {
            id: `entry:${collection.id}:${record.entry.id}:${entryLocale.locale}`,
            kind: "entry",
            title: entryLocale.title || entryLocale.slug,
            path: localizePublicPath({
              pathname,
              locale: entryLocale.locale,
              settings: localization,
            }),
            status: record.entry.status,
            collectionId: collection.id,
            collectionLabel: collection.label,
            locale: entryLocale.locale,
          });
        }
      }

      inspected += result.items.length;
      if (result.items.length < pageSize || inspected >= result.total) break;
      page += 1;
    }
  }

  return [...targetsByPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

export async function loadRedirectTargetPaths(
  adapter: StorageAdapter,
): Promise<Set<string>> {
  return new Set(
    (await listRedirectTargets(adapter)).map((target) => target.path),
  );
}
