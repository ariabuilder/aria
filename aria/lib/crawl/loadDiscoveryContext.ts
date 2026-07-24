import type { StorageAdapter } from "../storage/adapter";
import {
  LocalizedPageForDiscoverySchema,
  parsePageForDiscovery,
  type LocalizedPageForDiscovery,
  type PageForDiscovery,
} from "./schemas";
import type { DiscoverableCmsEntry } from "./schemas";
import { loadDiscoverableCmsEntries } from "./loadDiscoverableCmsEntries";
import { normalizeContentLocalization } from "../localization/contentLocale";

export async function loadDiscoveryContext(adapter: StorageAdapter): Promise<{
  siteSettings: Awaited<ReturnType<StorageAdapter["getSiteSettings"]>>;
  pages: PageForDiscovery[];
  cmsEntries: DiscoverableCmsEntry[];
  localizedPages: LocalizedPageForDiscovery[];
}> {
  const siteSettings = await adapter.getSiteSettings();
  const summaries = await adapter.listPagesDSL({ limit: 1000 });

  const pages = await Promise.all(
    summaries.map(async (summary) => {
      const published =
        summary.status === "published"
          ? await adapter.getPublishedPageDSL(summary.id)
          : null;

      return parsePageForDiscovery({
        id: summary.id,
        slug: summary.slug,
        parent: summary.parent,
        title: published?.title ?? summary.title,
        description: published?.description,
        status: summary.status,
        systemRole: summary.systemRole ?? "standard",
        accessMode: summary.accessMode ?? "public",
        updatedAt: summary.updatedAt,
        publishedAt: published?.publishedAt,
        settings: published?.settings,
      });
    }),
  );

  const cmsEntries = await loadDiscoverableCmsEntries(adapter, pages);
  const localization = normalizeContentLocalization(
    siteSettings?.localization?.content,
  );
  const enabledLocales = new Set(
    localization.locales
      .filter(
        (locale) =>
          locale.enabled && locale.code !== localization.defaultLocale,
      )
      .map((locale) => locale.code),
  );
  const localizedPages = (
    await Promise.all(
      pages
        .filter(
          (page) =>
            page.status === "published" &&
            page.systemRole === "standard" &&
            page.accessMode === "public" &&
            page.settings?.seo?.noindex !== true,
        )
        .map(async (page) => {
          const routes = await adapter.listPublishedPageLocaleRoutes(page.id);
          return Promise.all(
            routes.map(async (route) => {
              if (!enabledLocales.has(route.locale)) return null;
              const resolved = await adapter.resolvePublishedPageLocale(
                route.locale,
                route.pathnameKey,
              );
              if (!resolved || resolved.version.seo.noindex) return null;
              return LocalizedPageForDiscoverySchema.parse({
                pageId: page.id,
                locale: route.locale,
                pathname: resolved.route.pathname,
                publishedAt:
                  resolved.meta.publishedAt ?? resolved.version.createdAt,
                noindex: resolved.version.seo.noindex,
              });
            }),
          );
        }),
    )
  )
    .flat(2)
    .filter((page): page is LocalizedPageForDiscovery => page !== null);

  return { siteSettings, pages, cmsEntries, localizedPages };
}
