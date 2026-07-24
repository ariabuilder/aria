import type { StorageAdapter } from "../storage/adapter";
import type { AriaCollection, AriaEntryRecord } from "../cms/schemas";
import {
  buildCollectionsMap,
  buildEntrySlugIndex,
  buildPageSlugLookup,
  projectCollectionManifest,
  projectEntryRecord,
  resolveCmsExportOptions,
  resolveLocalesForExport,
  resolveSourceLocale,
  shouldIncludeEntryStatus,
} from "../cms/entryProjection";
import { renderStructuredTextToHtml } from "../cms/structuredText/renderToHtml";
import {
  SeedManifestSchema,
  type CmsExportOptions,
  type CollectionExportBundle,
  type ExportedEntry,
  type SeedManifest,
} from "./cmsTypes";
import { generateExportLibFiles } from "./generateExportLib";

function compareStrings(
  left: string | undefined,
  right: string | undefined,
): number {
  return (left ?? "").localeCompare(right ?? "");
}

function sortCollections(collections: AriaCollection[]): AriaCollection[] {
  return [...collections].sort(
    (left, right) =>
      compareStrings(left.name, right.name) ||
      compareStrings(left.id, right.id),
  );
}

function sortEntries(entries: AriaEntryRecord[]): AriaEntryRecord[] {
  return [...entries].sort((left, right) => {
    const leftLocale = resolveSourceLocale(left);
    const rightLocale = resolveSourceLocale(right);

    return (
      compareStrings(left.entry.collectionId, right.entry.collectionId) ||
      compareStrings(left.entry.status, right.entry.status) ||
      compareStrings(leftLocale?.slug, rightLocale?.slug) ||
      compareStrings(left.entry.id, right.entry.id)
    );
  });
}

function sanitizeArchiveSegment(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = (value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized.length > 0 ? normalized : fallback;
}

function toCanonicalEntryJsonPath(input: {
  collectionName: string;
  slug: string;
  locale: string;
  isSourceLocale: boolean;
  usedPaths: Set<string>;
}): string {
  const collectionSegment = sanitizeArchiveSegment(
    input.collectionName,
    "collection",
  );
  const entrySegment = sanitizeArchiveSegment(input.slug, "entry");
  const localeSuffix = input.isSourceLocale
    ? ""
    : `.${sanitizeArchiveSegment(input.locale, "locale")}`;
  const basePath = `export/content/collections/${collectionSegment}/${entrySegment}${localeSuffix}`;
  let path = `${basePath}.json`;

  if (!input.usedPaths.has(path)) {
    input.usedPaths.add(path);
    return path;
  }

  for (let index = 2; ; index += 1) {
    path = `${basePath}-${index}.json`;
    if (!input.usedPaths.has(path)) {
      input.usedPaths.add(path);
      return path;
    }
  }
}

async function listAllCmsEntries(
  adapter: StorageAdapter,
  collectionId: string,
): Promise<AriaEntryRecord[]> {
  const limit = 200;
  const records: AriaEntryRecord[] = [];

  for (let page = 1; ; page += 1) {
    const result = await adapter.listEntries({
      collectionId,
      page,
      limit,
      sort: [{ field: "updatedAt", direction: "asc" }],
    });

    for (const item of result.items) {
      const record = await adapter.getEntry({
        collectionId,
        idOrSlug: item.entry.id,
        includeRelations: true,
      });

      records.push(record ?? item);
    }

    if (records.length >= result.total || result.items.length === 0) {
      return records;
    }
  }
}

export async function collectCmsRecordsForExport(
  adapter: StorageAdapter,
  collections: readonly AriaCollection[],
): Promise<{
  collections: AriaCollection[];
  entries: AriaEntryRecord[];
}> {
  const sortedCollections = sortCollections([...collections]);
  const entriesByCollection = await Promise.all(
    sortedCollections.map((collection) =>
      listAllCmsEntries(adapter, collection.id),
    ),
  );

  return {
    collections: sortedCollections,
    entries: sortEntries(entriesByCollection.flat()),
  };
}

function collectionKindRank(kind: AriaCollection["kind"]): number {
  switch (kind) {
    case "tags":
      return 0;
    case "content":
      return 1;
    case "data":
      return 2;
    case "config":
      return 3;
    default:
      return 4;
  }
}

function buildSeedApplyOrder(collections: readonly AriaCollection[]): string[] {
  const sorted = [...collections].sort(
    (left, right) =>
      collectionKindRank(left.kind) - collectionKindRank(right.kind) ||
      compareStrings(left.name, right.name),
  );
  return sorted.map((collection) => collection.name);
}

function buildSeedManifest(
  collections: readonly AriaCollection[],
): SeedManifest {
  const names = collections.map((collection) => collection.name);
  return SeedManifestSchema.parse({
    version: 1,
    collections: names,
    applyOrder: buildSeedApplyOrder(collections),
  });
}

export async function exportCollections(input: {
  adapter: StorageAdapter;
  collections: readonly AriaCollection[];
  pages: ReadonlyArray<{ id: string; slug: string }>;
  options?: CmsExportOptions;
  generatedAt: string;
}): Promise<CollectionExportBundle> {
  const options = resolveCmsExportOptions(input.options);
  const payload = await collectCmsRecordsForExport(
    input.adapter,
    input.collections,
  );
  const collectionsMap = buildCollectionsMap(payload.collections);
  const slugIndex = buildEntrySlugIndex(payload.entries, collectionsMap);
  const pages = buildPageSlugLookup(input.pages);
  const usedPaths = new Set<string>();

  const collectionManifests: CollectionExportBundle["collectionManifests"] = [];
  const entryFiles: CollectionExportBundle["entryFiles"] = [];
  const entriesByCollection = new Map<string, AriaEntryRecord[]>();

  for (const record of payload.entries) {
    if (!shouldIncludeEntryStatus(record.entry.status, options.includeDrafts)) {
      continue;
    }

    const locales = resolveLocalesForExport(record, options.locales);
    if (locales.length === 0) {
      continue;
    }

    const collection = collectionsMap.get(record.entry.collectionId);
    if (!collection) {
      continue;
    }

    const bucket = entriesByCollection.get(collection.id) ?? [];
    bucket.push(record);
    entriesByCollection.set(collection.id, bucket);

    const sourceLocale = resolveSourceLocale(record);
    for (const locale of locales) {
      const bodyHtml = options.renderBodiesToHtml
        ? renderStructuredTextToHtml(locale.body ?? null)
        : undefined;

      const exportedEntry: ExportedEntry = projectEntryRecord({
        record,
        collection,
        locale,
        collections: collectionsMap,
        slugIndex,
        bodyHtml,
      });

      entryFiles.push({
        path: toCanonicalEntryJsonPath({
          collectionName: collection.name,
          slug: locale.slug,
          locale: locale.locale,
          isSourceLocale: sourceLocale?.locale === locale.locale,
          usedPaths,
        }),
        entry: exportedEntry,
      });
    }
  }

  for (const collection of payload.collections) {
    const entryCount = entriesByCollection.get(collection.id)?.length ?? 0;
    if (!options.includeCollections && entryCount === 0) {
      continue;
    }

    const manifest = projectCollectionManifest({
      collection,
      entryCount,
      exportedAt: input.generatedAt,
      pages,
    });

    collectionManifests.push({
      path: `export/content/collections/${sanitizeArchiveSegment(collection.name, "collection")}.json`,
      manifest,
    });
  }

  const seedManifest = options.includeSeedManifest
    ? buildSeedManifest(payload.collections)
    : null;

  const libFiles = options.includeQueryLib
    ? generateExportLibFiles(payload.collections)
    : [];

  return {
    collectionManifests,
    entryFiles,
    seedManifest,
    libFiles,
    counts: {
      collections: collectionManifests.length,
      entries: entryFiles.length,
      entryJsonFiles: entryFiles.length,
      collectionManifests: collectionManifests.length,
      markdownFiles: 0,
    },
  };
}

export function filterCmsPayloadForExport(input: {
  collections: readonly AriaCollection[];
  entries: readonly AriaEntryRecord[];
  options: CmsExportOptions;
}): {
  collections: AriaCollection[];
  entries: AriaEntryRecord[];
} {
  const options = resolveCmsExportOptions(input.options);
  const includedCollectionIds = new Set<string>();

  const entries = input.entries.filter((record) => {
    if (!shouldIncludeEntryStatus(record.entry.status, options.includeDrafts)) {
      return false;
    }
    includedCollectionIds.add(record.entry.collectionId);
    return true;
  });

  const collections = input.collections.filter(
    (collection) =>
      options.includeCollections || includedCollectionIds.has(collection.id),
  );

  return {
    collections: sortCollections(collections),
    entries: sortEntries(entries),
  };
}
