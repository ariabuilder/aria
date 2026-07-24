import type { StorageAdapter } from "../../adapter";
import {
  listMediaUsageByLogicalPath,
  pruneOrphanedMediaUsage,
  syncMediaResourceUsage,
  type MediaUsageStorageExecutor,
} from "../../../media/catalog/usage";
import {
  type MediaCatalogRepository,
} from "../../../media/catalog/repository";
import {
  deleteMediaTransformVariant,
  deleteMediaTransformState,
  getMediaTransformState,
  getMediaTransformVariant,
  listMediaTransformVariantCounts,
  moveMediaTransformState,
  promoteMediaSourceVersion,
  registerMediaSourceVersion,
  relocateMediaSourceVersionObject,
  saveMediaAssetProfile,
  saveMediaTransformVariant,
  type MediaTransformStorageExecutor,
} from "../../../media/transforms/storage";

export type MediaCatalogStorageDomain = Pick<
  StorageAdapter,
  | "listMediaUsageByLogicalPath"
  | "pruneOrphanedMediaUsage"
  | "upsertMediaCatalogAsset"
  | "markMediaCatalogAssetDeleted"
  | "moveMediaCatalogAsset"
  | "listMediaCatalogAssetsByIds"
  | "listMediaCatalogAssetsByLogicalPaths"
  | "syncMediaUsage"
  | "getMediaTransformState"
  | "listMediaTransformVariantCounts"
  | "getMediaTransformVariant"
  | "registerMediaSourceVersion"
  | "relocateMediaSourceVersionObject"
  | "promoteMediaSourceVersion"
  | "saveMediaAssetProfile"
  | "saveMediaTransformVariant"
  | "deleteMediaTransformVariant"
  | "moveMediaTransformState"
  | "deleteMediaTransformState"
>;

type MediaCatalogStorageContext = {
  mediaUsageExecutor(): MediaUsageStorageExecutor;
  mediaCatalogRepository(): MediaCatalogRepository;
  mediaTransformExecutor(): MediaTransformStorageExecutor;
};

export function createMediaCatalogStorageDomain(
  context: MediaCatalogStorageContext,
): MediaCatalogStorageDomain {
  return {
    listMediaUsageByLogicalPath: (logicalPath) =>
      listMediaUsageByLogicalPath(context.mediaUsageExecutor(), logicalPath),
    pruneOrphanedMediaUsage: () =>
      pruneOrphanedMediaUsage(context.mediaUsageExecutor()),
    upsertMediaCatalogAsset: (input, authorship) =>
      context.mediaCatalogRepository().upsertUploadedMedia(input, authorship),
    markMediaCatalogAssetDeleted: (input, authorship) =>
      context.mediaCatalogRepository().markDeleted(input, authorship),
    moveMediaCatalogAsset: (input, authorship) =>
      context.mediaCatalogRepository().moveMedia(input, authorship),
    listMediaCatalogAssetsByIds: (mediaIds) =>
      context.mediaCatalogRepository().listAssetsByIds(mediaIds),
    listMediaCatalogAssetsByLogicalPaths: (logicalPaths) =>
      context.mediaCatalogRepository().listAssetsByLogicalPaths(logicalPaths),
    syncMediaUsage: (input) =>
      syncMediaResourceUsage(context.mediaUsageExecutor(), input),
    getMediaTransformState: (assetPath) =>
      getMediaTransformState(context.mediaTransformExecutor(), assetPath),
    listMediaTransformVariantCounts: () =>
      listMediaTransformVariantCounts(context.mediaTransformExecutor()),
    getMediaTransformVariant: (id) =>
      getMediaTransformVariant(context.mediaTransformExecutor(), id),
    registerMediaSourceVersion: (input) =>
      registerMediaSourceVersion(context.mediaTransformExecutor(), input),
    relocateMediaSourceVersionObject: (input) =>
      relocateMediaSourceVersionObject(context.mediaTransformExecutor(), input),
    promoteMediaSourceVersion: (input) =>
      promoteMediaSourceVersion(context.mediaTransformExecutor(), input),
    saveMediaAssetProfile: (input) =>
      saveMediaAssetProfile(context.mediaTransformExecutor(), input),
    saveMediaTransformVariant: (input) =>
      saveMediaTransformVariant(context.mediaTransformExecutor(), input),
    deleteMediaTransformVariant: (assetPath, id) =>
      deleteMediaTransformVariant(
        context.mediaTransformExecutor(),
        assetPath,
        id,
      ),
    moveMediaTransformState: (oldAssetPath, newAssetPath) =>
      moveMediaTransformState(
        context.mediaTransformExecutor(),
        oldAssetPath,
        newAssetPath,
      ),
    deleteMediaTransformState: (assetPath) =>
      deleteMediaTransformState(context.mediaTransformExecutor(), assetPath),
  };
}
