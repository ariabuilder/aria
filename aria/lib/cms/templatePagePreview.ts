import type { z } from "zod";
import type { StorageAdapter } from "../storage/adapter";
import { RenderCmsDataOptionsSchema } from "./resolveBoundNodes";
import type { AriaCollection, AriaEntryRecord } from "./schemas";

type RenderCmsDataOptionsInput = z.input<typeof RenderCmsDataOptionsSchema>;

function sourceEntrySlug(record: AriaEntryRecord): string {
  return (
    record.locales.find((locale) => locale.isSource)?.slug ??
    record.locales[0]?.slug ??
    ""
  );
}

function findTemplateCollection(
  collections: readonly AriaCollection[],
  pageId: string,
): AriaCollection | null {
  return (
    collections.find((collection) => collection.templatePageId === pageId) ??
    null
  );
}

async function loadDefaultPreviewEntry(
  adapter: StorageAdapter,
  collectionId: string,
): Promise<AriaEntryRecord | null> {
  const published = await adapter.listEntries({
    collectionId,
    limit: 1,
    page: 1,
    status: "published",
  });
  const publishedEntry = published.items[0];
  if (publishedEntry && sourceEntrySlug(publishedEntry)) {
    return publishedEntry;
  }

  const drafts = await adapter.listEntries({
    collectionId,
    limit: 1,
    page: 1,
  });
  const draftEntry = drafts.items[0];
  if (draftEntry && sourceEntrySlug(draftEntry)) {
    return draftEntry;
  }

  return null;
}

/**
 * Resolves CMS render options for a collection entry-template page when no
 * entry context was supplied (snapshots, publish validation, thumbnails).
 */
export async function resolveTemplatePageCmsOptions(
  adapter: StorageAdapter,
  pageId: string,
  baseOptions: RenderCmsDataOptionsInput = {},
): Promise<RenderCmsDataOptionsInput> {
  if (baseOptions.entryContext) {
    return baseOptions;
  }

  if (typeof adapter.listCollections !== "function") {
    return baseOptions;
  }

  const collections = await adapter.listCollections();
  const collection = findTemplateCollection(collections, pageId);
  if (!collection) {
    return baseOptions;
  }

  const previewEntry = await loadDefaultPreviewEntry(adapter, collection.id);
  if (!previewEntry) {
    return baseOptions;
  }

  const slug = sourceEntrySlug(previewEntry);
  if (!slug) {
    return baseOptions;
  }

  return {
    ...baseOptions,
    preview: baseOptions.preview ?? true,
    entryContext: {
      collectionId: collection.id,
      entryId: previewEntry.entry.id,
      slug,
    },
  };
}
