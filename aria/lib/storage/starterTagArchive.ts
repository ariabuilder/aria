import { AriaCollectionSchema, type AriaCollection } from "../cms/schemas";
import { cmsSaveCollection } from "../cms/storage/collections";
import type { CmsStorageExecutor } from "../cms/storage/executor";
import {
  TAG_ARCHIVE_PAGE_ID,
  TAGS_COLLECTION_NAME,
} from "./starterContent";

export const TAG_ARCHIVE_URL_PATTERN = "/tags/{slug}";

export function isTagArchiveStarterConfigured(collection: {
  urlPattern: string | null;
  templatePageId: string | null;
}): boolean {
  return (
    collection.urlPattern === TAG_ARCHIVE_URL_PATTERN &&
    collection.templatePageId === TAG_ARCHIVE_PAGE_ID
  );
}

export function buildUpgradedTagsCollectionForArchive(
  collection: AriaCollection,
  now: string,
): AriaCollection {
  return AriaCollectionSchema.parse({
    ...collection,
    urlPattern: TAG_ARCHIVE_URL_PATTERN,
    templatePageId: TAG_ARCHIVE_PAGE_ID,
    updatedAt: now,
  });
}

export async function upgradeTagsCollectionForArchive(
  executor: CmsStorageExecutor,
  collection: AriaCollection,
  now: string,
): Promise<void> {
  if (isTagArchiveStarterConfigured(collection)) {
    return;
  }
  await cmsSaveCollection(
    executor,
    buildUpgradedTagsCollectionForArchive(collection, now),
  );
}

export async function ensureTagsCollectionArchiveStarterUpgrade(input: {
  executor: CmsStorageExecutor;
  getCollectionByName: (name: string) => Promise<AriaCollection | null>;
  now: string;
}): Promise<boolean> {
  const tags = await input.getCollectionByName(TAGS_COLLECTION_NAME);
  if (!tags) {
    return false;
  }
  if (isTagArchiveStarterConfigured(tags)) {
    return false;
  }
  await upgradeTagsCollectionForArchive(input.executor, tags, input.now);
  return true;
}
