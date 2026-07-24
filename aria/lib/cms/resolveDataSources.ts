import { z } from "zod";
import type { StorageAdapter } from "../storage/adapter";
import { NodeDataSourceSchema } from "../schemas/nodes";
import { ENTRY_STATUSES, type EntrySort } from "./constants";
import {
  AriaCollectionSchema,
  AriaEntryRecordSchema,
  type AriaCollection,
  type AriaEntryRecord,
} from "./schemas";
import { CmsServiceError } from "./errors";
import {
  collectionHasRelationFields,
  hydrateResolvedEntryFrontmatter,
  loadCollectionsForHydration,
} from "./hydrateEntryFields";
import { resolveCmsListFilter } from "./listFilters";
import { getCollectionFromAdapter } from "./services/collections";
import {
  getEntryFromAdapter,
  queryEntriesFromAdapter,
  getContentLocaleSettings,
} from "./services/entries";
import {
  resolveContentLocale,
  type ContentLocalizationSettings,
} from "../localization/contentLocale";

const ResolvableDataSourceSchema = NodeDataSourceSchema.unwrap()
  .extend({
    type: z.enum(["cms", "collection"]),
    collection: z.string().trim().min(1),
    mode: z.enum(["single", "list"]).default("list"),
    limit: z.int().positive().max(100).optional(),
    offset: z.int().nonnegative().optional(),
    status: z.enum(ENTRY_STATUSES).optional(),
  })
  .strict();

const DataSourceFilterSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
  })
  .catchall(z.unknown());

const DataSourceEntryContextSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
  })
  .strict();

const DataSourceSortFieldSchema = z.enum([
  "title",
  "slug",
  "updatedAt",
  "publishedAt",
  "createdAt",
]);

export const ResolveDataSourcesRequestSchema = z
  .object({
    sources: z.record(z.string().trim().min(1), ResolvableDataSourceSchema),
    preview: z.boolean().default(false),
    locale: z.string().trim().min(1).optional(),
    entryContext: DataSourceEntryContextSchema.optional(),
  })
  .strict();

export const ResolvedCmsEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    collectionId: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    title: z.string(),
    status: z.enum(ENTRY_STATUSES),
    frontmatter: z.record(z.string(), z.unknown()),
    body: z.unknown().nullable(),
    updatedAt: z.string().trim().min(1),
    publishedAt: z.string().trim().min(1).nullable(),
    record: AriaEntryRecordSchema,
  })
  .strict();

export const ResolvedDataSourceSchema = z
  .object({
    collection: AriaCollectionSchema,
    mode: z.enum(["single", "list"]),
    entry: ResolvedCmsEntrySchema.nullable(),
    items: z.array(ResolvedCmsEntrySchema),
    total: z.int().nonnegative(),
  })
  .strict();

export const ResolveDataSourcesResponseSchema = z.record(
  z.string(),
  ResolvedDataSourceSchema,
);

export type ResolveDataSourcesRequest = z.infer<
  typeof ResolveDataSourcesRequestSchema
>;
export type ResolvedCmsEntry = z.infer<typeof ResolvedCmsEntrySchema>;
export type ResolvedDataSource = z.infer<typeof ResolvedDataSourceSchema>;
export type ResolveDataSourcesResponse = z.infer<
  typeof ResolveDataSourcesResponseSchema
>;

function sourceStatus(
  source: z.infer<typeof ResolvableDataSourceSchema>,
  preview: boolean,
): (typeof ENTRY_STATUSES)[number] | undefined {
  if (source.status) {
    return source.status;
  }
  return preview ? undefined : "published";
}

function primaryLocale(
  record: AriaEntryRecord,
  settings: ContentLocalizationSettings,
  locale?: string,
) {
  return resolveContentLocale(record.locales, settings, locale)?.locale;
}

function mapEntry(
  record: AriaEntryRecord,
  settings: ContentLocalizationSettings,
  locale?: string,
): ResolvedCmsEntry {
  const entryLocale = primaryLocale(record, settings, locale);
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

async function resolveCollection(
  adapter: StorageAdapter,
  collectionNameOrId: string,
): Promise<AriaCollection> {
  return AriaCollectionSchema.parse(
    await getCollectionFromAdapter(adapter, collectionNameOrId),
  );
}

function singleIdOrSlug(
  source: z.infer<typeof ResolvableDataSourceSchema>,
  collection: AriaCollection,
  request: ResolveDataSourcesRequest,
): string {
  if (request.entryContext?.collectionId === collection.id) {
    return request.entryContext.entryId ?? request.entryContext.slug ?? "";
  }

  const filter = DataSourceFilterSchema.parse(source.filter ?? {});
  return filter.id ?? filter.slug ?? "";
}

function sourceSort(sort: string | undefined): EntrySort[] | undefined {
  if (!sort) {
    return undefined;
  }
  const direction = sort.startsWith("-") ? "desc" : "asc";
  const field = DataSourceSortFieldSchema.parse(sort.replace(/^-/, ""));
  return [{ field, direction }];
}

function sourceLocale(
  source: z.infer<typeof ResolvableDataSourceSchema>,
  request: ResolveDataSourcesRequest,
): string | undefined {
  return source.locale ?? request.locale;
}

function withSourceContext(input: {
  error: CmsServiceError;
  sourceKey: string;
  collectionName: string;
  mode: "single" | "list";
}): CmsServiceError {
  if (input.error.message.includes(`CMS data source "${input.sourceKey}"`)) {
    return input.error;
  }
  return new CmsServiceError(
    input.error.code,
    `CMS data source "${input.sourceKey}" (collection: ${input.collectionName}, mode: ${input.mode}) failed: ${input.error.message}`,
  );
}

function entryInclude(
  source: z.infer<typeof ResolvableDataSourceSchema>,
  collection: AriaCollection,
): string[] | undefined {
  if (source.include?.length) {
    return source.include;
  }
  if (collectionHasRelationFields(collection)) {
    return ["relations"];
  }
  return undefined;
}

async function mapAndHydrateEntry(
  adapter: StorageAdapter,
  collection: AriaCollection,
  record: AriaEntryRecord,
  settings: ContentLocalizationSettings,
  locale: string | undefined,
  collections: readonly AriaCollection[],
): Promise<ResolvedCmsEntry> {
  const entry = mapEntry(record, settings, locale);
  return hydrateResolvedEntryFrontmatter(
    adapter,
    collection,
    entry,
    locale,
    collections,
  );
}

function emptyResolvedDataSource(
  collection: AriaCollection,
  mode: "single" | "list",
): ResolvedDataSource {
  return ResolvedDataSourceSchema.parse({
    collection,
    mode,
    entry: null,
    items: [],
    total: 0,
  });
}

async function resolveSingleSource(
  adapter: StorageAdapter,
  collection: AriaCollection,
  source: z.infer<typeof ResolvableDataSourceSchema>,
  request: ResolveDataSourcesRequest,
  collections: readonly AriaCollection[],
  settings: ContentLocalizationSettings,
): Promise<ResolvedDataSource | null> {
  const idOrSlug = singleIdOrSlug(source, collection, request);
  const locale = sourceLocale(source, request);
  if (!idOrSlug) {
    if (request.preview) {
      return null;
    }
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      `Single data source requires entry context, filter.id, or filter.slug: ${collection.name}`,
    );
  }

  const record = await getEntryFromAdapter(adapter, {
    collectionId: collection.id,
    idOrSlug,
    locale,
    include: entryInclude(source, collection),
  });
  const entry = await mapAndHydrateEntry(
    adapter,
    collection,
    record,
    settings,
    locale,
    collections,
  );

  return ResolvedDataSourceSchema.parse({
    collection,
    mode: "single",
    entry,
    items: [entry],
    total: 1,
  });
}

async function resolveListSource(
  adapter: StorageAdapter,
  collection: AriaCollection,
  source: z.infer<typeof ResolvableDataSourceSchema>,
  request: ResolveDataSourcesRequest,
  collections: readonly AriaCollection[],
  settings: ContentLocalizationSettings,
): Promise<ResolvedDataSource> {
  const locale = sourceLocale(source, request);
  let resolvedFilter;
  if (source.filter) {
    try {
      resolvedFilter = resolveCmsListFilter({
        collection,
        rawFilter: source.filter as Record<string, unknown>,
        entryContext: request.entryContext,
        collections,
      });
    } catch (error) {
      if (request.preview && error instanceof CmsServiceError) {
        return emptyResolvedDataSource(collection, "list");
      }
      throw error;
    }
  }
  const result = await queryEntriesFromAdapter(adapter, {
    collectionId: collection.id,
    filter: resolvedFilter,
    limit: source.limit,
    offset: source.offset,
    status: sourceStatus(source, request.preview),
    sort: sourceSort(source.sort),
    locale,
    include: entryInclude(source, collection),
  });
  const items = await Promise.all(
    result.items.map((record) =>
      mapAndHydrateEntry(
        adapter,
        collection,
        record,
        settings,
        locale,
        collections,
      ),
    ),
  );

  return ResolvedDataSourceSchema.parse({
    collection,
    mode: "list",
    entry: items[0] ?? null,
    items,
    total: result.total,
  });
}

export async function resolveDataSources(
  adapter: StorageAdapter,
  input: ResolveDataSourcesRequest,
): Promise<ResolveDataSourcesResponse> {
  const request = ResolveDataSourcesRequestSchema.parse(input);
  const [collections, localeSettings] = await Promise.all([
    loadCollectionsForHydration(adapter),
    getContentLocaleSettings(adapter),
  ]);
  const entries = await Promise.all(
    Object.entries(request.sources).map(async ([key, source]) => {
      let collection: AriaCollection | null = null;
      let resolved: ResolvedDataSource | null;
      try {
        collection = await resolveCollection(adapter, source.collection);
        resolved =
          source.mode === "single"
            ? await resolveSingleSource(
                adapter,
                collection,
                source,
                request,
                collections,
                localeSettings,
              )
            : await resolveListSource(
                adapter,
                collection,
                source,
                request,
                collections,
                localeSettings,
              );
      } catch (error) {
        if (error instanceof CmsServiceError) {
          throw withSourceContext({
            error,
            sourceKey: key,
            collectionName: collection?.name ?? source.collection,
            mode: source.mode,
          });
        }
        throw error;
      }
      if (!resolved) {
        return null;
      }
      return [key, resolved] as const;
    }),
  );

  return ResolveDataSourcesResponseSchema.parse(
    Object.fromEntries(
      entries.filter(
        (entry): entry is readonly [string, ResolvedDataSource] =>
          entry !== null,
      ),
    ),
  );
}
