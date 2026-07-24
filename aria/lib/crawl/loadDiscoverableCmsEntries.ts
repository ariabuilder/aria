import type { StorageAdapter } from "../storage/adapter";
import { buildCmsEntryPublicPath } from "../cms/publicPaths";
import { normalizeContentLocalization } from "../localization/contentLocale";
import { localizePublicPath } from "../localization/publicRoutes";
import {
  parseDiscoverableCmsEntry,
  type DiscoverableCmsEntry,
  type PageForDiscovery,
} from "./schemas";
import { isCmsEntryDiscoverable } from "./cmsDiscoverability";

export async function loadDiscoverableCmsEntries(
  adapter: StorageAdapter,
  pages: readonly PageForDiscovery[],
): Promise<DiscoverableCmsEntry[]> {
  const collections = await adapter.listCollections();
  const siteSettings = await adapter.getSiteSettings();
  const localization = normalizeContentLocalization(
    siteSettings?.localization?.content,
  );
  const enabledLocales = new Set(
    localization.locales
      .filter((locale) => locale.enabled)
      .map((locale) => locale.code),
  );
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const entries: DiscoverableCmsEntry[] = [];

  for (const collection of collections) {
    if (!collection.urlPattern || !collection.templatePageId) {
      continue;
    }

    const templatePage = pageById.get(collection.templatePageId) ?? null;
    const pageSize = 250;
    let page = 1;
    let inspected = 0;
    while (true) {
      const result = await adapter.listEntries({
        collectionId: collection.id,
        limit: pageSize,
        page,
        status: "published",
      });
      const records = await Promise.all(
        result.items.map((record) =>
          adapter.getEntry({
            collectionId: collection.id,
            idOrSlug: record.entry.id,
            includeAllLocales: true,
          }),
        ),
      );

      for (const record of records) {
        if (!record) continue;
        for (const locale of record.locales) {
          if (!enabledLocales.has(locale.locale)) continue;
          const routePath = buildCmsEntryPublicPath(
            collection.urlPattern,
            locale.slug,
          );
          if (!routePath) continue;
          const discoverableEntry = parseDiscoverableCmsEntry({
            collectionId: collection.id,
            entryId: record.entry.id,
            locale: locale.locale,
            slug: locale.slug,
            pathname: localizePublicPath({
              pathname: routePath,
              locale: locale.locale,
              settings: localization,
            }),
            updatedAt: record.entry.updatedAt,
            publishedAt: record.entry.publishedAt,
          });
          if (
            !isCmsEntryDiscoverable({
              entry: discoverableEntry,
              templatePage,
              frontmatter: locale.frontmatter,
            })
          )
            continue;
          entries.push(discoverableEntry);
        }
      }
      inspected += result.items.length;
      if (result.items.length < pageSize || inspected >= result.total) break;
      page += 1;
    }
  }

  return entries;
}
