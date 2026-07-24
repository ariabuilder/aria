import { buildCmsEntryPublicPath } from "../cms/publicPaths";
import { structuredTextToPlainText } from "../cms/structuredText/plainText";
import type { StorageAdapter } from "../storage/adapter";
import {
  normalizeContentLocalization,
  type ContentLocalizationSettings,
} from "../localization/contentLocale";
import { localizePublicPath } from "../localization/publicRoutes";
import { normalizeBaseUrl } from "./normalizeBaseUrl";
import {
  LocalizedCollectionFeedSchema,
  type LocalizedCollectionFeed,
} from "./schemas";

const MAX_ITEMS = 100;
const BODY_LIMIT = 16_000;
const ENTRY_PAGE_SIZE = 100;

function plainExcerpt(value: unknown): string | undefined {
  const text =
    typeof value === "string"
      ? value
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : structuredTextToPlainText(value).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, BODY_LIMIT) : undefined;
}

export async function loadLocalizedCollectionFeed(input: {
  adapter: StorageAdapter;
  collectionIdOrName: string;
  locale: string;
  localization?: ContentLocalizationSettings;
}): Promise<LocalizedCollectionFeed | null> {
  const collection = await input.adapter.getCollection(
    input.collectionIdOrName,
  );
  if (
    !collection ||
    !collection.supports.includes("rss") ||
    !collection.schema?.rss?.enabled ||
    !collection.urlPattern ||
    !collection.templatePageId
  ) {
    return null;
  }
  const settings = await input.adapter.getSiteSettings();
  const localization =
    input.localization ??
    normalizeContentLocalization(settings?.localization?.content);
  const localeDefinition = localization.locales.find(
    (value) => value.enabled && value.code === input.locale,
  );
  const baseUrl = normalizeBaseUrl(settings?.siteUrl);
  if (!localeDefinition || !baseUrl) return null;
  const template = await input.adapter.getPublishedPageDSL(
    collection.templatePageId,
  );
  if (!template) return null;
  const items: LocalizedCollectionFeed["items"] = [];
  let page = 1;
  let inspected = 0;
  const itemLimit = Math.min(collection.schema.rss.itemLimit, MAX_ITEMS);
  while (items.length < itemLimit) {
    const listed = await input.adapter.listEntries({
      collectionId: collection.id,
      status: "published",
      limit: ENTRY_PAGE_SIZE,
      page,
      sort: [
        { field: "publishedAt", direction: "desc" },
        { field: "updatedAt", direction: "desc" },
      ],
    });
    const records = await Promise.all(
      listed.items.map((record) =>
        input.adapter.getEntry({
          collectionId: collection.id,
          idOrSlug: record.entry.id,
          includeAllLocales: true,
        }),
      ),
    );
    for (const record of records) {
      const variant = record?.locales.find(
        (candidate) => candidate.locale === input.locale,
      );
      if (!record || !variant) continue;
      const pathname = buildCmsEntryPublicPath(
        collection.urlPattern!,
        variant.slug,
      );
      if (!pathname) continue;
      const localizedPath = localizePublicPath({
        pathname,
        locale: input.locale,
        settings: localization,
      });
      items.push({
        id: record.entry.id,
        title: variant.title,
        link: new URL(localizedPath, baseUrl).toString(),
        description: plainExcerpt(variant.body),
        publishedAt: record.entry.publishedAt,
        updatedAt: record.entry.updatedAt,
      });
      if (items.length >= itemLimit) break;
    }
    inspected += listed.items.length;
    if (listed.items.length < ENTRY_PAGE_SIZE || inspected >= listed.total)
      break;
    page += 1;
  }
  const updatedAt = items.reduce(
    (latest, item) => (item.updatedAt > latest ? item.updatedAt : latest),
    collection.updatedAt,
  );
  const feedPath = localizePublicPath({
    pathname: `/${collection.name}/rss.xml`,
    locale: input.locale,
    settings: localization,
  });
  return LocalizedCollectionFeedSchema.parse({
    collectionId: collection.id,
    locale: input.locale,
    title: collection.schema.rss.title ?? collection.label,
    description: collection.schema.rss.description,
    link: new URL(feedPath, baseUrl).toString(),
    updatedAt,
    items,
  });
}
