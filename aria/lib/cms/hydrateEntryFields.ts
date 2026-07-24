import type { StorageAdapter } from "../storage/adapter";
import type { FieldSchema } from "./fieldSchema";
import type { AriaCollection, AriaEntryRecord } from "./schemas";
import { entryFieldsForCollection } from "./systemFields";
import { getCollectionFromAdapter } from "./services/collections";
import { getEntryFromAdapter } from "./services/entries";
import type { ResolvedCmsEntry } from "./resolveDataSources";

export type HydratedEntryValue = Record<string, unknown>;

function primaryLocale(record: AriaEntryRecord, locale?: string) {
  return (
    (locale
      ? record.locales.find((entryLocale) => entryLocale.locale === locale)
      : undefined) ??
    record.locales.find((entryLocale) => entryLocale.isSource) ??
    record.locales[0]
  );
}

function buildCollectionsLookup(
  collections: readonly AriaCollection[],
): Map<string, AriaCollection> {
  const lookup = new Map<string, AriaCollection>();
  for (const collection of collections) {
    lookup.set(collection.id, collection);
    lookup.set(collection.name, collection);
  }
  return lookup;
}

function resolveTargetCollection(
  targetCollection: string,
  collectionsByKey: Map<string, AriaCollection>,
): AriaCollection | null {
  return collectionsByKey.get(targetCollection) ?? null;
}

function mapRecordToHydratedEntry(
  record: AriaEntryRecord,
  locale?: string,
): HydratedEntryValue | null {
  const entryLocale = primaryLocale(record, locale);
  if (!entryLocale) {
    return null;
  }

  return {
    id: record.entry.id,
    slug: entryLocale.slug,
    title: entryLocale.title,
    status: record.entry.status,
    body: entryLocale.body,
    updatedAt: record.entry.updatedAt,
    publishedAt: record.entry.publishedAt,
    ...entryLocale.frontmatter,
    frontmatter: entryLocale.frontmatter,
    record,
  };
}

async function hydrateReferenceField(
  adapter: StorageAdapter,
  field: FieldSchema & { type: "reference"; targetCollection: string },
  rawValue: unknown,
  locale: string | undefined,
  collectionsByKey: Map<string, AriaCollection>,
): Promise<unknown> {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return rawValue;
  }

  const targetCollection = resolveTargetCollection(
    field.targetCollection,
    collectionsByKey,
  );
  if (!targetCollection) {
    return rawValue;
  }

  try {
    const record = await getEntryFromAdapter(adapter, {
      collectionId: targetCollection.id,
      idOrSlug: rawValue,
      locale,
    });
    return mapRecordToHydratedEntry(record, locale) ?? rawValue;
  } catch {
    return rawValue;
  }
}

async function hydrateRelationField(
  adapter: StorageAdapter,
  field: FieldSchema & { type: "relation"; targetCollection: string },
  record: AriaEntryRecord,
  locale: string | undefined,
  collectionsByKey: Map<string, AriaCollection>,
): Promise<unknown> {
  const relations = (record.relations ?? [])
    .filter((relation) => relation.fieldKey === field.key)
    .sort((left, right) => left.position - right.position);

  if (relations.length === 0) {
    return [];
  }

  const targetCollection = resolveTargetCollection(
    field.targetCollection,
    collectionsByKey,
  );
  if (!targetCollection) {
    return [];
  }

  const hydrated: HydratedEntryValue[] = [];
  for (const relation of relations) {
    try {
      const targetRecord = await getEntryFromAdapter(adapter, {
        collectionId: targetCollection.id,
        idOrSlug: relation.targetEntryId,
        locale,
      });
      const value = mapRecordToHydratedEntry(targetRecord, locale);
      if (value) {
        hydrated.push(value);
      }
    } catch {
      continue;
    }
  }

  return hydrated;
}

export function collectionHasRelationFields(collection: AriaCollection): boolean {
  return entryFieldsForCollection(collection).some(
    (field) => field.type === "relation",
  );
}

export async function hydrateResolvedEntryFrontmatter(
  adapter: StorageAdapter,
  collection: AriaCollection,
  entry: ResolvedCmsEntry,
  locale?: string,
  collections?: readonly AriaCollection[],
): Promise<ResolvedCmsEntry> {
  const collectionsByKey = buildCollectionsLookup(
    collections ?? [collection],
  );
  const fields = entryFieldsForCollection(collection);
  const hydratedFrontmatter: Record<string, unknown> = {
    ...entry.frontmatter,
  };

  for (const field of fields) {
    if (field.type === "reference" && field.targetCollection) {
      hydratedFrontmatter[field.key] = await hydrateReferenceField(
        adapter,
        field as FieldSchema & { type: "reference"; targetCollection: string },
        entry.frontmatter[field.key],
        locale,
        collectionsByKey,
      );
      continue;
    }

    if (field.type === "relation" && field.targetCollection) {
      hydratedFrontmatter[field.key] = await hydrateRelationField(
        adapter,
        field as FieldSchema & { type: "relation"; targetCollection: string },
        entry.record,
        locale,
        collectionsByKey,
      );
    }
  }

  if (
    Object.keys(hydratedFrontmatter).every(
      (key) => hydratedFrontmatter[key] === entry.frontmatter[key],
    )
  ) {
    return entry;
  }

  return {
    ...entry,
    frontmatter: hydratedFrontmatter,
    record: {
      ...entry.record,
      locales: entry.record.locales.map((entryLocale) =>
        entryLocale.locale ===
        (primaryLocale(entry.record, locale)?.locale ?? entryLocale.locale)
          ? { ...entryLocale, frontmatter: hydratedFrontmatter }
          : entryLocale,
      ),
    },
  };
}

export async function loadCollectionsForHydration(
  adapter: StorageAdapter,
): Promise<AriaCollection[]> {
  return adapter.listCollections();
}

export async function resolveCollectionForHydration(
  adapter: StorageAdapter,
  collectionIdOrName: string,
  collections?: readonly AriaCollection[],
): Promise<AriaCollection> {
  const cached = collections?.find(
    (collection) =>
      collection.id === collectionIdOrName ||
      collection.name === collectionIdOrName,
  );
  if (cached) {
    return cached;
  }
  return getCollectionFromAdapter(adapter, collectionIdOrName);
}
