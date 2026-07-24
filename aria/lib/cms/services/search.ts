import type { StorageAdapter } from "../../storage/adapter";
import { generateId } from "../../crypto";
import { structuredTextToPlainText } from "../structuredText/plainText";
import {
  CmsSearchDocumentSchema,
  CmsSearchResultSchema,
  type AriaCollection,
  type AriaEntryRecord,
  type CmsSearchDocument,
  type CmsSearchResult,
} from "../schemas";

function valueToSearchText(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(valueToSearchText).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(valueToSearchText)
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function searchableFrontmatter(
  collection: AriaCollection,
  frontmatter: Record<string, unknown>,
): string {
  return collection.schema.fields
    .filter((field) => field.searchable)
    .map((field) => valueToSearchText(frontmatter[field.key]))
    .filter(Boolean)
    .join(" ");
}

function collectionSearchDocument(
  collection: AriaCollection,
): CmsSearchDocument {
  return CmsSearchDocumentSchema.parse({
    entityType: "collection",
    entityId: collection.id,
    collectionId: collection.id,
    locale: "global",
    title: collection.label,
    slug: collection.name,
    collectionName: collection.name,
    collectionLabel: collection.label,
    status: null,
    searchableText:
      `${collection.name} ${collection.label}`.toLocaleLowerCase(),
    sourceVersion: String(collection.schema.version),
    updatedAt: collection.updatedAt,
  });
}

function entrySearchDocuments(
  collection: AriaCollection,
  record: AriaEntryRecord,
): CmsSearchDocument[] {
  return record.locales.map((locale) =>
    CmsSearchDocumentSchema.parse({
      entityType: "entry",
      entityId: record.entry.id,
      collectionId: record.entry.collectionId,
      locale: locale.locale,
      title: locale.title || "Untitled",
      slug: locale.slug,
      collectionName: collection.name,
      collectionLabel: collection.label,
      status: record.entry.status,
      searchableText: [
        locale.title,
        locale.slug,
        structuredTextToPlainText(locale.body),
        searchableFrontmatter(collection, locale.frontmatter),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase(),
      sourceVersion: `${record.entry.version}:${locale.locale}`,
      updatedAt: record.entry.updatedAt,
    }),
  );
}

export async function syncCmsCollectionSearchDocument(
  adapter: StorageAdapter,
  collection: AriaCollection,
): Promise<void> {
  try {
    await adapter.replaceCmsSearchDocuments([
      collectionSearchDocument(collection),
    ]);
  } catch (error) {
    reportSearchSyncFailure("collection", collection.id, error);
  }
}

export async function syncCmsEntrySearchDocuments(
  adapter: StorageAdapter,
  record: AriaEntryRecord,
): Promise<void> {
  try {
    const collection = await adapter.getCollection(record.entry.collectionId);
    if (!collection) return;
    await adapter.replaceCmsSearchDocuments(
      entrySearchDocuments(collection, record),
    );
  } catch (error) {
    reportSearchSyncFailure("entry", record.entry.id, error);
  }
}

function reportSearchSyncFailure(
  entityType: "collection" | "entry",
  entityId: string,
  error: unknown,
): void {
  console.error("CMS search synchronization deferred", {
    entityType,
    entityId,
    error: error instanceof Error ? error.message : String(error),
  });
}

export async function rebuildCmsCollectionSearchDocuments(
  adapter: StorageAdapter,
  collection: AriaCollection,
): Promise<void> {
  const generation = generateId();
  const started = await adapter.beginCmsSearchScopeRebuild({
    collectionId: collection.id,
    generation,
  });
  if (!started) {
    throw new Error(
      "CMS search rebuild is already in progress for this collection",
    );
  }
  try {
    const documents = await buildCmsCollectionSearchDocuments(
      adapter,
      collection,
    );
    await adapter.writeCmsSearchScopeGeneration({
      collectionId: collection.id,
      generation,
      documents,
    });
    const committed = await adapter.commitCmsSearchScopeRebuild({
      collectionId: collection.id,
      generation,
    });
    if (!committed) {
      throw new Error(
        "CMS search rebuild could not activate its completed generation",
      );
    }
    await adapter.cleanupInactiveCmsSearchDocuments(collection.id);
  } catch (error) {
    await adapter.abortCmsSearchScopeRebuild({
      collectionId: collection.id,
      generation,
    });
    throw error;
  }
}

export async function buildCmsCollectionSearchDocuments(
  adapter: StorageAdapter,
  collection: AriaCollection,
): Promise<CmsSearchDocument[]> {
  const documents: CmsSearchDocument[] = [collectionSearchDocument(collection)];
  const limit = 100;
  let page = 1;
  while (true) {
    const listed = await adapter.listEntries({
      collectionId: collection.id,
      page,
      limit,
    });
    const records = await Promise.all(
      listed.items.map((item) =>
        adapter.getEntry({
          collectionId: collection.id,
          idOrSlug: item.entry.id,
          includeAllLocales: true,
        }),
      ),
    );
    for (const record of records) {
      if (record) documents.push(...entrySearchDocuments(collection, record));
    }
    if (listed.items.length < limit || page * limit >= listed.total) {
      return documents;
    }
    page += 1;
  }
}

export async function getCmsSearchIndexHealth(
  adapter: StorageAdapter,
): Promise<{
  expectedDocuments: number;
  expectedCollections: number;
  expectedEntries: number;
  documents: number;
  collections: number;
  entries: number;
  missingDocuments: number;
  orphanedDocuments: number;
  staleDocuments: number;
  countsByScope: Array<{
    entityType: CmsSearchDocument["entityType"];
    collectionId: string;
    locale: string;
    documents: number;
  }>;
  isHealthy: boolean;
}> {
  const current = await adapter.getCmsSearchDocumentStats();
  return {
    ...current,
    isHealthy:
      current.documents === current.expectedDocuments &&
      current.collections === current.expectedCollections &&
      current.entries === current.expectedEntries &&
      current.missingDocuments === 0 &&
      current.orphanedDocuments === 0 &&
      current.staleDocuments === 0,
  };
}

export async function ensureCmsSearchIndex(
  adapter: StorageAdapter,
): Promise<{
  ready: boolean;
  repairAttempted: boolean;
  failedCollectionIds: string[];
}> {
  try {
    const initialHealth = await getCmsSearchIndexHealth(adapter);
    if (initialHealth.isHealthy) {
      return { ready: true, repairAttempted: false, failedCollectionIds: [] };
    }

    const failedCollectionIds: string[] = [];
    for (const collection of await adapter.listCollections()) {
      try {
        await rebuildCmsCollectionSearchDocuments(adapter, collection);
      } catch (error) {
        failedCollectionIds.push(collection.id);
        reportSearchSyncFailure("collection", collection.id, error);
      }
    }

    return {
      ready: (await getCmsSearchIndexHealth(adapter)).isHealthy,
      repairAttempted: true,
      failedCollectionIds,
    };
  } catch (error) {
    reportSearchSyncFailure("collection", "all", error);
    return {
      ready: false,
      repairAttempted: true,
      failedCollectionIds: [],
    };
  }
}

function searchRank(document: CmsSearchDocument, query: string): number | null {
  const title = document.title.toLocaleLowerCase();
  const slug = document.slug?.toLocaleLowerCase() ?? "";
  const searchableText = document.searchableText.toLocaleLowerCase();
  if (title === query || slug === query) return 0;
  if (title.startsWith(query) || slug.startsWith(query)) return 1;
  return title.includes(query) || slug.includes(query) || searchableText.includes(query)
    ? 2
    : null;
}

export async function searchCanonicalCmsDocuments(
  adapter: StorageAdapter,
  options: { query: string; locales: readonly string[]; limit: number },
): Promise<CmsSearchResult[]> {
  const query = options.query.trim().toLocaleLowerCase();
  const locales = new Set(options.locales);
  if (!query || locales.size === 0) return [];

  const documents = (
    await Promise.all(
      (await adapter.listCollections()).map((collection) =>
        buildCmsCollectionSearchDocuments(adapter, collection),
      ),
    )
  ).flat();

  return documents
    .flatMap((document) => {
      if (!locales.has(document.locale)) return [];
      const rank = searchRank(document, query);
      return rank === null
        ? []
        : [CmsSearchResultSchema.parse({ ...document, rank })];
    })
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.entityId.localeCompare(right.entityId),
    )
    .slice(0, options.limit);
}

export async function removeCmsEntrySearchDocuments(
  adapter: StorageAdapter,
  entryId: string,
): Promise<void> {
  try {
    await adapter.deleteCmsSearchDocuments({
      entityType: "entry",
      entityId: entryId,
    });
  } catch (error) {
    reportSearchSyncFailure("entry", entryId, error);
  }
}

export async function removeCmsCollectionSearchDocuments(
  adapter: StorageAdapter,
  collectionId: string,
): Promise<void> {
  try {
    await adapter.deleteCmsSearchDocuments({ collectionId });
  } catch (error) {
    reportSearchSyncFailure("collection", collectionId, error);
  }
}
