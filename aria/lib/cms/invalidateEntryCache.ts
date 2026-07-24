import { z } from "zod";
import {
  type CacheContext,
  invalidateComposeCache,
  purgePublicCollectionCache,
  purgePublicCollectionEntryCache,
  purgePublicPageCache,
} from "../cache/service";
import type { StorageAdapter } from "../storage/adapter";

export const InvalidateCmsEntryCacheInputSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
  })
  .strict();

async function invalidatePageComposeAndPublicCache(
  adapter: StorageAdapter,
  context: CacheContext | undefined,
  pageId: string,
): Promise<void> {
  if (!context) {
    return;
  }

  const page =
    (await adapter.getPageDSL(pageId).catch(() => null)) ??
    (await adapter.getPublishedPageDSL(pageId).catch(() => null));
  if (!page) {
    return;
  }

  await invalidateComposeCache(context, "page", page.slug, undefined, "publishing");
  await purgePublicPageCache(context, { id: page.id, slug: page.slug });
}

export async function invalidateCmsEntryPublicCache(
  adapter: StorageAdapter,
  context: CacheContext | undefined,
  input: z.input<typeof InvalidateCmsEntryCacheInputSchema>,
): Promise<void> {
  const parsed = InvalidateCmsEntryCacheInputSchema.parse(input);
  const collection = await adapter.getCollection(parsed.collectionId);
  if (!collection?.templatePageId) {
    return;
  }

  if (context) {
    await purgePublicCollectionEntryCache(context, {
      collectionId: parsed.collectionId,
      entryId: parsed.entryId,
      templatePageId: collection.templatePageId,
    });
  }

  await invalidatePageComposeAndPublicCache(
    adapter,
    context,
    collection.templatePageId,
  );

  if (collection.listPageId) {
    await invalidatePageComposeAndPublicCache(
      adapter,
      context,
      collection.listPageId,
    );
  }
}

export async function invalidateCollectionPublicCache(
  adapter: StorageAdapter,
  context: CacheContext | undefined,
  collectionId: string,
): Promise<void> {
  const collection = await adapter.getCollection(collectionId);
  if (!collection) {
    return;
  }

  if (context) {
    await purgePublicCollectionCache(context, collectionId);
  }

  if (collection.templatePageId) {
    await invalidatePageComposeAndPublicCache(
      adapter,
      context,
      collection.templatePageId,
    );
  }

  if (collection.listPageId) {
    await invalidatePageComposeAndPublicCache(
      adapter,
      context,
      collection.listPageId,
    );
  }
}
