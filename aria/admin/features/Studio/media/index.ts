/**
 * Studio Media — Public API The Media feature the media library management
 * interface for uploading, organizing, and selecting images and files within Studio. all.
 */

export { default as MediaView } from "./MediaView.vue";
export { default as MediaDetailView } from "./MediaDetailView.vue";

export { useMediaAssets } from "./composables/useMediaAssets";
export {
  MediaUploadError,
  loadMediaAssets,
  uploadMediaFile,
} from "./composables/useMediaClient";
export { useMediaUsage } from "./composables/useMediaUsage";
export { useMediaSync } from "./composables/useMediaSync";
export { useMediaHistory } from "./composables/useMediaHistory";
export {
  useMediaViewState,
  MEDIA_VIEW_FILTER_TABS,
} from "./composables/useMediaViewState";
export { useMediaPickerState } from "./composables/useMediaPickerState";
export { useFontPreview } from "./composables/useFontPreview";
export type { UseFontPreviewReturn } from "./composables/useFontPreview";

export { default as MediaGridCard } from "./components/MediaGridCard.vue";
export { default as FontAssetPreview } from "./components/FontAssetPreview.vue";
export { default as MediaPickerDialog } from "./components/MediaPickerDialog.vue";

export { default as DeleteMediaDialog } from "./dialogs/DeleteMediaDialog.vue";
export { default as MediaSyncDialog } from "./dialogs/MediaSyncDialog.vue";
export { default as PreviewMediaDialog } from "./dialogs/PreviewMediaDialog.vue";
export { default as RenameMediaDialog } from "./dialogs/RenameMediaDialog.vue";

export type {
  MediaAsset,
  FontAssetFormat,
  MediaUsageItem,
} from "./types/media";

export {
  SyncSummarySchema,
  SyncPlanItemSchema,
  SyncPlanSchema,
  SyncPlanResponseSchema,
  SyncHistoryJobSchema,
  SyncHistoryResponseSchema,
  SyncApplyResponseSchema,
} from "./types/media-sync";

export type {
  SyncDirection,
  ConflictPolicy,
  SyncPlan,
  SyncHistoryJob,
  SyncAction,
} from "./types/media-sync";

export {
  formatFileSize,
  formatUploadedAt,
  formatAssetType,
  getAssetTypeLabel,
  formatSyncAction,
  getSyncActionIcon,
  inferSyncAssetType,
  getSyncAssetName,
  getAssetIcon,
  getFontAssetFormat,
  isFontAsset,
} from "./utils/media-formatters";

export {
  getAssetSourceUrl,
  getThumbnailUrl,
  isCloudflareOptimized,
  handleThumbnailError,
} from "./utils/media-previews";
