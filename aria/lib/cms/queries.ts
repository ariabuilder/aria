import type { StorageAdapter } from "../storage/adapter";
import type { AriaCollection, AriaEntryRecord } from "./schemas";
import { CmsServiceError } from "./errors";
import {
  getEntryFromAdapter,
  getContentLocaleSettings,
  queryEntriesFromAdapter,
} from "./services/entries";
import { hydrateResolvedEntryFrontmatter } from "./hydrateEntryFields";
import {
  buildCollectionCacheHint,
  buildEntryCacheHint,
  GetAriaCollectionOptionsSchema,
  GetAriaEntryOptionsSchema,
  mapStatusFilter,
  projectAriaEntry,
  type AriaCacheHint,
  type AriaQueryEntry,
  type GetAriaCollectionOptions,
  type GetAriaEntryOptions,
} from "./queryTypes";
import { resolveContentLocale, type ContentLocalizationSettings } from "../localization/contentLocale";
import {
  ResolvedCmsEntrySchema,
  type ResolvedCmsEntry,
} from "./resolveDataSources";

export type { AriaCacheHint, AriaEntry, AriaQueryEntry } from "./queryTypes";
export type {
  GetAriaCollectionOptions,
  GetAriaEntryOptions,
} from "./queryTypes";

async function resolveCollection(
  adapter: StorageAdapter,
  collectionNameOrId: string,
): Promise<AriaCollection> {
  const collection = await adapter.getCollection(collectionNameOrId);
  if (!collection) {
    throw new CmsServiceError(
      "NOT_FOUND",
      `Collection not found: ${collectionNameOrId}`,
    );
  }
  return collection;
}

function mapResolvedEntry(
  record: AriaEntryRecord,
  settings: ContentLocalizationSettings,
  locale?: string,
): ResolvedCmsEntry {
  const entryLocale = resolveContentLocale(
    record.locales,
    settings,
    locale,
  )?.locale;

  if (!entryLocale) {
    throw new CmsServiceError("VALIDATION_ERROR", "Entry has no locale rows");
  }

  return ResolvedCmsEntrySchema.parse({
    id: record.entry.id,
    collectionId: record.entry.collectionId,
    slug: entryLocale.slug,
    title: entryLocale.title,
    status: record.entry.status,
    frontmatter: entryLocale.frontmatter,
    body: entryLocale.body,
    updatedAt: record.entry.updatedAt,
    publishedAt: record.entry.publishedAt,
    record,
  });
}

async function resolveEntryData(
  adapter: StorageAdapter,
  collection: AriaCollection,
  record: AriaEntryRecord,
  settings: ContentLocalizationSettings,
  options: { locale?: string; include?: string[] },
): Promise<Record<string, unknown>> {
  const resolved = mapResolvedEntry(record, settings, options.locale);

  if (!options.include?.length) {
    return resolved.frontmatter ?? {};
  }

  const hydrated = await hydrateResolvedEntryFrontmatter(
    adapter,
    collection,
    resolved,
    options.locale,
    [collection],
  );

  return hydrated.frontmatter ?? {};
}

export async function getAriaEntry<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  adapter: StorageAdapter,
  collectionNameOrId: string,
  slug: string,
  optionsInput?: GetAriaEntryOptions,
): Promise<{ entry: AriaQueryEntry<T> | null; cacheHint: AriaCacheHint }> {
  const options = GetAriaEntryOptionsSchema.parse(optionsInput ?? {});
  const collection = await resolveCollection(adapter, collectionNameOrId);
  const localeSettings = await getContentLocaleSettings(adapter);

  let record: AriaEntryRecord | null;
  try {
    record = await getEntryFromAdapter(adapter, {
      collectionId: collection.id,
      idOrSlug: slug,
      locale: options.locale,
      include: options.include,
    });
  } catch (error) {
    if (error instanceof CmsServiceError && error.code === "NOT_FOUND") {
      return {
        entry: null,
        cacheHint: buildCollectionCacheHint({ collectionId: collection.id }),
      };
    }
    throw error;
  }

  const statusFilter = mapStatusFilter(options.status);
  if (
    statusFilter &&
    !Array.isArray(statusFilter) &&
    record.entry.status !== statusFilter
  ) {
    return {
      entry: null,
      cacheHint: buildCollectionCacheHint({ collectionId: collection.id }),
    };
  }

  const resolved = resolveContentLocale(
    record.locales,
    localeSettings,
    options.locale,
  );
  if (!resolved) {
    return {
      entry: null,
      cacheHint: buildCollectionCacheHint({ collectionId: collection.id }),
    };
  }

  const data = await resolveEntryData(adapter, collection, record, localeSettings, {
    locale: options.locale,
    include: options.include,
  });

  const entry = projectAriaEntry({
    record,
    collection,
    locale: resolved.resolvedLocale,
    slug: resolved.locale.slug,
    title: resolved.locale.title,
    frontmatter: data,
  });

  return {
    entry: entry as AriaQueryEntry<T>,
    cacheHint: buildEntryCacheHint({
      collectionId: collection.id,
      entryId: record.entry.id,
      templatePageId: collection.templatePageId,
    }),
  };
}

export async function getAriaCollection<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  adapter: StorageAdapter,
  collectionNameOrId: string,
  optionsInput?: GetAriaCollectionOptions,
): Promise<{
  entries: AriaQueryEntry<T>[];
  total: number;
  cacheHint: AriaCacheHint;
}> {
  const options = GetAriaCollectionOptionsSchema.parse(optionsInput ?? {});
  const collection = await resolveCollection(adapter, collectionNameOrId);
  const localeSettings = await getContentLocaleSettings(adapter);
  const sort = options.orderBy
    ? Object.entries(options.orderBy)
        .filter((entry): entry is [typeof entry[0], "asc" | "desc"] =>
          entry[1] === "asc" || entry[1] === "desc",
        )
        .map(([field, direction]) => ({
          field: field as
            | "title"
            | "slug"
            | "updatedAt"
            | "publishedAt"
            | "createdAt",
          direction,
        }))
    : undefined;

  const result = await queryEntriesFromAdapter(adapter, {
    collectionId: collection.id,
    locale: options.locale,
    status: mapStatusFilter(options.status),
    limit: options.limit,
    offset: options.offset,
    sort,
    filter: options.filter,
    include: options.include,
  });

  const entries = result.items
    .map((record) => {
      const resolved = resolveContentLocale(
        record.locales,
        localeSettings,
        options.locale,
      );
      if (!resolved) {
        return null;
      }
      return projectAriaEntry({
        record,
        collection,
        locale: resolved.resolvedLocale,
        slug: resolved.locale.slug,
        title: resolved.locale.title,
        frontmatter: resolved.locale.frontmatter ?? {},
      }) as AriaQueryEntry<T>;
    })
    .filter((entry): entry is AriaQueryEntry<T> => entry !== null);

  return {
    entries,
    total: result.total,
    cacheHint: buildCollectionCacheHint({ collectionId: collection.id }),
  };
}

export async function getAriaEntries<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  adapter: StorageAdapter,
  collectionNameOrId: string,
  options?: GetAriaCollectionOptions,
): Promise<{
  entries: AriaQueryEntry<T>[];
  total: number;
  cacheHint: AriaCacheHint;
}> {
  return getAriaCollection<T>(adapter, collectionNameOrId, options);
}
