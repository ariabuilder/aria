import type { EntryStatus } from "./constants";
import type {
  AriaCollection,
  AriaEntryLocale,
  AriaEntryRecord,
  AriaEntryRelation,
} from "./schemas";
import {
  ExportedCollectionManifestSchema,
  ExportedEntryRelationSchema,
  ExportedEntrySchema,
  type CmsExportLocaleFilter,
  type CmsExportOptions,
  type ExportedCollectionManifest,
  type ExportedEntry,
  type ExportedEntryRelation,
} from "../export/cmsTypes";
import { StructuredTextDocumentSchema } from "./structuredText/schemas";

export type PageSlugLookup = ReadonlyMap<string, string>;

export type EntrySlugIndexKey = `${string}:${string}`;

export function buildEntrySlugIndex(
  entries: readonly AriaEntryRecord[],
  collections: ReadonlyMap<string, AriaCollection>,
): ReadonlyMap<EntrySlugIndexKey, string> {
  const index = new Map<EntrySlugIndexKey, string>();

  for (const record of entries) {
    const collection = collections.get(record.entry.collectionId);
    const collectionName =
      collection?.name ?? collection?.id ?? record.entry.collectionId;
    const sourceLocale = resolveSourceLocale(record);
    if (!sourceLocale) {
      continue;
    }
    index.set(
      `${collectionName}:${record.entry.id}`,
      sourceLocale.slug,
    );
  }

  return index;
}

export function resolveSourceLocale(
  record: AriaEntryRecord,
): AriaEntryLocale | null {
  return (
    record.locales.find((locale) => locale.isSource) ??
    record.locales[0] ??
    null
  );
}

export function resolvePageSlug(
  pageId: string | null | undefined,
  pages: PageSlugLookup,
): string | null {
  if (!pageId) {
    return null;
  }
  return pages.get(pageId) ?? null;
}

export function projectCollectionManifest(input: {
  collection: AriaCollection;
  entryCount: number;
  exportedAt: string;
  pages: PageSlugLookup;
}): ExportedCollectionManifest {
  return ExportedCollectionManifestSchema.parse({
    id: input.collection.id,
    name: input.collection.name,
    label: input.collection.label,
    kind: input.collection.kind,
    schema: input.collection.schema,
    urlPattern: input.collection.urlPattern,
    templatePageSlug: resolvePageSlug(
      input.collection.templatePageId,
      input.pages,
    ),
    listPageSlug: resolvePageSlug(input.collection.listPageId, input.pages),
    exportedAt: input.exportedAt,
    entryCount: input.entryCount,
  });
}

export function mapRelationsToPortable(input: {
  relations: readonly AriaEntryRelation[] | undefined;
  collections: ReadonlyMap<string, AriaCollection>;
  slugIndex: ReadonlyMap<EntrySlugIndexKey, string>;
}): ExportedEntryRelation[] {
  if (!input.relations?.length) {
    return [];
  }

  return input.relations
    .map((relation): ExportedEntryRelation | null => {
      for (const collection of input.collections.values()) {
        const targetSlug =
          input.slugIndex.get(`${collection.name}:${relation.targetEntryId}`) ??
          input.slugIndex.get(`${collection.id}:${relation.targetEntryId}`);
        if (!targetSlug) {
          continue;
        }
        return ExportedEntryRelationSchema.parse({
          fieldKey: relation.fieldKey,
          targetCollection: collection.name,
          targetSlug,
          position: relation.position,
          meta: relation.meta,
        });
      }
      return null;
    })
    .filter((relation): relation is ExportedEntryRelation => relation !== null);
}

function parseStructuredBody(body: unknown): ExportedEntry["body"] {
  if (body === null || body === undefined) {
    return null;
  }
  const parsed = StructuredTextDocumentSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function shouldIncludeEntryStatus(
  status: EntryStatus,
  includeDrafts: boolean,
): boolean {
  if (includeDrafts) {
    return true;
  }
  return status === "published";
}

export function resolveLocalesForExport(
  record: AriaEntryRecord,
  locales: CmsExportLocaleFilter,
): AriaEntryLocale[] {
  if (locales === "all") {
    return record.locales;
  }

  const sourceLocale = resolveSourceLocale(record);
  if (!sourceLocale) {
    return [];
  }

  if (locales === "source") {
    return [sourceLocale];
  }

  const allowed = new Set(locales);
  return record.locales.filter((locale) => allowed.has(locale.locale));
}

export function projectEntryRecord(input: {
  record: AriaEntryRecord;
  collection: AriaCollection;
  locale: AriaEntryLocale;
  collections: ReadonlyMap<string, AriaCollection>;
  slugIndex: ReadonlyMap<EntrySlugIndexKey, string>;
  bodyHtml?: string;
}): ExportedEntry {
  const relations = mapRelationsToPortable({
    relations: input.record.relations,
    collections: input.collections,
    slugIndex: input.slugIndex,
  });

  return ExportedEntrySchema.parse({
    id: input.record.entry.id,
    status: input.record.entry.status,
    slug: input.locale.slug,
    locale: input.locale.locale,
    title: input.locale.title,
    frontmatter: input.locale.frontmatter ?? {},
    body: parseStructuredBody(input.locale.body),
    bodyHtml: input.bodyHtml,
    relations,
    publishedAt: input.record.entry.publishedAt,
    updatedAt: input.record.entry.updatedAt,
  });
}

export function resolveCmsExportOptions(
  options: CmsExportOptions | undefined,
): CmsExportOptions {
  return {
    includeCollections: options?.includeCollections ?? true,
    includeDrafts: options?.includeDrafts ?? false,
    locales: options?.locales ?? "source",
    renderBodiesToHtml: options?.renderBodiesToHtml ?? false,
    includeStructuredTextRenderer: options?.includeStructuredTextRenderer ?? true,
    includeMarkdown: options?.includeMarkdown ?? true,
    includeMonolithicCmsJson: options?.includeMonolithicCmsJson ?? true,
    includeCanonicalJson: options?.includeCanonicalJson ?? true,
    includeQueryLib: options?.includeQueryLib ?? true,
    includeSeedManifest: options?.includeSeedManifest ?? true,
  };
}

export function buildCollectionsMap(
  collections: readonly AriaCollection[],
): ReadonlyMap<string, AriaCollection> {
  return new Map(collections.map((collection) => [collection.id, collection]));
}

export function buildPageSlugLookup(
  pages: ReadonlyArray<{ id: string; slug: string }>,
): PageSlugLookup {
  return new Map(pages.map((page) => [page.id, page.slug]));
}
