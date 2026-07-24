import { computed, ref } from "vue";
import { actions } from "astro:actions";
import {
  getForbiddenMessageForOperation,
  useCapabilities,
} from "@/composables/useCapabilities";
import { toast } from "vue-sonner";
import { z } from "zod";
import { log } from "@/lib/utils/logger";
import { TYPOGRAPHY_FONTS_UPDATED_EVENT } from "@/features/Design/composables/useTypography";
import type { MediaAsset } from "../types/media";
import { useMediaHistory } from "./useMediaHistory";
import {
  MediaAssetSchema,
  parseDeleteMediaPayload,
  parseRenameMediaPayload,
} from "./mediaActionResults";
import type { RenameMediaResult } from "./mediaActionResults";
import {
  createEmptyMediaMutationReferenceSummary,
  referencesNeedManualCleanup,
} from "../../../../../lib/schemas/mediaMutations";
import { normalizeLogicalMediaPath } from "../../../../../lib/media/utils/path";
import {
  MediaAssetsLoadError,
  MediaUploadError,
  loadMediaAssets,
  uploadMediaFile,
} from "./useMediaClient";

const DeleteMediaInputSchema = z.object({
  path: z.string().min(1),
});

const RenameMediaInputSchema = z.object({
  oldPath: z.string().min(1),
  newName: z.string().min(1),
});

const MediaUsagesInputSchema = z.object({
  logicalPath: z.string().min(1),
});

const DuplicateMediaInputSchema = z.object({
  path: z.string().min(1),
  newName: z.string().min(1).optional(),
});

type DeleteAssetResult =
  | { ok: true; referenceCleanupNeeded: boolean }
  | { ok: false; retainedDueToReferences?: boolean };

const DuplicateMediaResultSchema = z
  .object({
    success: z.literal(true),
    originalPath: z.string().min(1).optional(),
    newPath: z.string().min(1),
    sourceUrl: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    publicUrl: z.string().min(1).optional(),
  })
  .strict();

// MODULE-LEVEL CACHE — persists across component re-mounts

const STALE_THRESHOLD_MS = 5 * 60_000; // 5 minutes
const cachedAssets = ref<MediaAsset[]>([]);
let lastFetchedAt = 0;
let inFlightLoad: { promise: Promise<MediaAsset[]>; force: boolean } | null =
  null;
let cacheEpoch = 0;
let requestSequence = 0;
let latestAppliedRequest = 0;

function hasFreshCachedAssets(): boolean {
  return (
    cachedAssets.value.length > 0 &&
    Date.now() - lastFetchedAt < STALE_THRESHOLD_MS
  );
}

function clearSharedMediaAssetsCache(): void {
  cacheEpoch += 1;
  cachedAssets.value = [];
  lastFetchedAt = 0;
}

export function resetMediaAssetsCacheForTests(): void {
  cachedAssets.value = [];
  lastFetchedAt = 0;
  inFlightLoad = null;
  cacheEpoch = 0;
  requestSequence = 0;
  latestAppliedRequest = 0;
}

export function updateSharedMediaAssetCropCount(
  assetPath: string,
  cropCount: number,
): void {
  const logicalPath = normalizeLogicalMediaPath(assetPath);
  cachedAssets.value = cachedAssets.value.map((asset) =>
    normalizeLogicalMediaPath(asset.url) === logicalPath
      ? { ...asset, cropCount }
      : asset,
  );
}

export async function loadSharedMediaAssets(
  options: { force?: boolean; source?: string } = {},
): Promise<MediaAsset[]> {
  const { force = false, source = "loadSharedMediaAssets" } = options;

  if (!force && hasFreshCachedAssets()) {
    return cachedAssets.value;
  }

  if (inFlightLoad && (!force || inFlightLoad.force)) {
    return inFlightLoad.promise;
  }

  if (force) {
    cacheEpoch += 1;
  }

  const requestEpoch = cacheEpoch;
  const requestId = ++requestSequence;

  const promise = (async () => {
    try {
      const parsedAssets = await loadMediaAssets({ source });
      const isLatestForEpoch =
        requestEpoch === cacheEpoch && requestId >= latestAppliedRequest;

      if (isLatestForEpoch) {
        cachedAssets.value = parsedAssets;
        lastFetchedAt = Date.now();
        latestAppliedRequest = requestId;
      }

      return cachedAssets.value;
    } catch (err) {
      if (err instanceof MediaAssetsLoadError && err.clearCache) {
        clearSharedMediaAssetsCache();
      }

      throw err;
    }
  })();

  inFlightLoad = { promise, force };

  try {
    return await promise;
  } finally {
    if (inFlightLoad?.promise === promise) {
      inFlightLoad = null;
    }
  }
}

export function useMediaAssets() {
  const { executeMediaHistory, recordMediaEvent } = useMediaHistory();
  const { canOperation } = useCapabilities();
  const canDeleteMedia = computed(() => canOperation("media.delete"));

  const assets = cachedAssets;
  const isLoading = ref(false);
  const isUploading = ref(false);

  const isRenameDialogOpen = ref(false);
  const assetToRename = ref<MediaAsset | null>(null);
  const renameInput = ref("");
  const renameExtension = ref("");
  const renameReferenceCount = ref<number | null>(null);
  const isRenaming = ref(false);
  const isDeleteDialogOpen = ref(false);
  const assetToDelete = ref<MediaAsset | null>(null);
  const isDeleting = ref(false);

  function splitFileName(filename: string): {
    baseName: string;
    extension: string;
  } {
    const lastDotIndex = filename.lastIndexOf(".");

    if (lastDotIndex <= 0 || lastDotIndex === filename.length - 1) {
      return { baseName: filename, extension: "" };
    }

    return {
      baseName: filename.slice(0, lastDotIndex),
      extension: filename.slice(lastDotIndex),
    };
  }

  function parseDeleteResult(path: string, data: unknown): DeleteAssetResult {
    const parsed = parseDeleteMediaPayload(data, {
      source: "useMediaAssets.handleDelete",
      path,
    });
    if (!parsed) {
      return { ok: false };
    }

    if (!parsed.deleted) {
      return { ok: false, retainedDueToReferences: true };
    }

    return {
      ok: true,
      referenceCleanupNeeded: referencesNeedManualCleanup(parsed.references),
    };
  }

  function applyOptimisticDelete(assetId: string): () => void {
    const snapshot = cachedAssets.value;
    cachedAssets.value = cachedAssets.value.filter(
      (asset) => asset.id !== assetId,
    );
    return () => {
      cachedAssets.value = snapshot;
    };
  }

  async function verifyAssetDeletedFromServer(
    assetId: string,
  ): Promise<boolean> {
    try {
      const refreshedAssets = await loadSharedMediaAssets({
        force: true,
        source: "useMediaAssets.verifyAssetDeletedFromServer",
      });
      return !refreshedAssets.some((asset) => asset.id === assetId);
    } catch {
      return false;
    }
  }

  async function loadRenameReferenceCount(asset: MediaAsset): Promise<void> {
    const logicalPath = asset.url || asset.id;
    const parsedInput = MediaUsagesInputSchema.safeParse({ logicalPath });
    if (!parsedInput.success) {
      renameReferenceCount.value = null;
      return;
    }

    try {
      const { data, error } = await actions.media.usages(parsedInput.data);
      if (error || !data || !data.available) {
        renameReferenceCount.value = null;
        return;
      }

      renameReferenceCount.value = data.usages.length;
    } catch {
      renameReferenceCount.value = null;
    }
  }

  async function loadAssets(
    options: { silent?: boolean; force?: boolean } = {},
  ): Promise<void> {
    const { silent = false, force = false } = options;

    if (!force && hasFreshCachedAssets()) {
      return;
    }

    if (!silent) {
      isLoading.value = true;
    }

    try {
      await loadSharedMediaAssets({
        force,
        source: "useMediaAssets.loadAssets",
      });
    } catch (err) {
      log("error", "[MediaView] Error loading assets", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (!silent) {
        isLoading.value = false;
      }
    }
  }

  async function handleUpload(): Promise<void> {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept =
      "image/*,video/*,.pdf,.doc,.docx,.woff2,.woff,.ttf,.otf,.eot,font/*";

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      isUploading.value = true;

      try {
        let uploadedFont = false;

        for (const file of Array.from(files)) {
          if (!(file instanceof File)) {
            await recordMediaEvent({
              type: "media-upload-failed",
              description: "Upload failed: invalid file payload",
            });
            continue;
          }

          let uploaded: Awaited<ReturnType<typeof uploadMediaFile>>;
          try {
            uploaded = await uploadMediaFile({
              file,
              source: "useMediaAssets.handleUpload",
            });
          } catch (err) {
            const description =
              err instanceof MediaUploadError
                ? err.message
                : `Upload failed: ${file.name}`;
            await recordMediaEvent({
              type: "media-upload-failed",
              description,
            });
            toast.error(description);
            log("error", "[MediaView] Upload error", {
              error: err instanceof Error ? err.message : String(err),
              fileName: file.name,
            });
            continue;
          }
          if (!uploaded) {
            await recordMediaEvent({
              type: "media-upload-failed",
              description: `Upload failed: ${file.name}`,
            });
            continue;
          }

          const lowerName = file.name.toLowerCase();
          const isFontUpload =
            [".woff2", ".woff", ".ttf", ".otf", ".eot"].some((extension) =>
              lowerName.endsWith(extension),
            ) || file.type.toLowerCase().includes("font");

          if (isFontUpload) {
            uploadedFont = true;
          }

          await recordMediaEvent({
            type: "media-upload",
            description: `Uploaded media: ${file.name}`,
          });
        }
        await loadAssets({ force: true });

        if (uploadedFont) {
          window.dispatchEvent(new Event(TYPOGRAPHY_FONTS_UPDATED_EVENT));
        }
      } catch (err) {
        await recordMediaEvent({
          type: "media-upload-failed",
          description: "Upload failed",
        });
        log("error", "[MediaView] Upload error", {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        isUploading.value = false;
      }
    };

    input.click();
  }

  function handleCopyUrl(asset: MediaAsset): void {
    navigator.clipboard.writeText(asset.url);
    console.log("[MediaView] Copied URL:", asset.url);
  }

  function isFontAssetUpload(asset: MediaAsset): boolean {
    const lowerName = asset.name.toLowerCase();
    const mimeType = asset.mimeType?.toLowerCase() || "";
    return (
      [".woff2", ".woff", ".ttf", ".otf", ".eot"].some((extension) =>
        lowerName.endsWith(extension),
      ) || mimeType.includes("font")
    );
  }

  async function handleDelete(asset: MediaAsset): Promise<void> {
    const parsedAsset = MediaAssetSchema.safeParse(asset);
    if (!parsedAsset.success) {
      log("error", "[MediaView] Invalid media asset payload for delete", {
        issues: parsedAsset.error.issues,
      });
      return;
    }

    assetToDelete.value = parsedAsset.data;
    isDeleteDialogOpen.value = true;
  }

  function closeDeleteDialog(force = false): void {
    if (isDeleting.value && !force) return;
    isDeleteDialogOpen.value = false;
    assetToDelete.value = null;
  }

  async function deleteAssetValidated(
    asset: MediaAsset,
    options: { suppressReferenceWarning?: boolean } = {},
  ): Promise<DeleteAssetResult> {
    const parsedAsset = MediaAssetSchema.safeParse(asset);
    if (!parsedAsset.success) {
      log("error", "[MediaView] Invalid media asset payload for delete", {
        issues: parsedAsset.error.issues,
      });
      return { ok: false };
    }

    const validatedAsset = parsedAsset.data;
    const rollbackDelete = applyOptimisticDelete(validatedAsset.id);

    try {
      const parsedInput = DeleteMediaInputSchema.safeParse({
        path: validatedAsset.id,
      });
      if (!parsedInput.success) {
        rollbackDelete();
        log("error", "[MediaView] Invalid delete payload", {
          issues: parsedInput.error.issues,
        });
        return { ok: false };
      }

      const { data, error } = await actions.media.delete(parsedInput.data);
      if (error?.code === "FORBIDDEN") {
        rollbackDelete();
        toast.error(getForbiddenMessageForOperation("media.delete"));
        return { ok: false };
      }
      if (error) {
        rollbackDelete();
        await recordMediaEvent({
          type: "media-delete-failed",
          description: `Delete failed: ${validatedAsset.name}`,
          affectedNodeIds: [validatedAsset.id],
        });
        log("error", "[MediaView] Delete error", {
          error: error instanceof Error ? error.message : String(error),
        });
        return { ok: false };
      }

      let deleteResult = parseDeleteResult(validatedAsset.id, data);
      if (!deleteResult.ok && deleteResult.retainedDueToReferences) {
        rollbackDelete();
        await loadAssets({ silent: true, force: true });
        await recordMediaEvent({
          type: "media-delete-failed",
          description: `Delete retained media with active references: ${validatedAsset.name}`,
          affectedNodeIds: [validatedAsset.id],
        });
        toast.warning(
          "Asset was retained because some references could not be updated safely.",
        );
        return { ok: false };
      }
      if (!deleteResult.ok) {
        const deletedOnServer = await verifyAssetDeletedFromServer(
          validatedAsset.id,
        );
        if (deletedOnServer) {
          deleteResult = { ok: true, referenceCleanupNeeded: false };
        }
      }

      if (!deleteResult.ok) {
        rollbackDelete();
        await recordMediaEvent({
          type: "media-delete-failed",
          description: `Delete failed: ${validatedAsset.name}`,
          affectedNodeIds: [validatedAsset.id],
        });
        return { ok: false };
      }

      await recordMediaEvent({
        type: "media-delete",
        description: `Deleted media: ${validatedAsset.name}`,
        affectedNodeIds: [validatedAsset.id],
      });

      if (isFontAssetUpload(validatedAsset)) {
        window.dispatchEvent(new Event(TYPOGRAPHY_FONTS_UPDATED_EVENT));
      }

      if (
        deleteResult.referenceCleanupNeeded &&
        !options.suppressReferenceWarning
      ) {
        toast.warning(
          "Asset deleted, but some references may need manual cleanup.",
        );
      }

      return deleteResult;
    } catch (err) {
      if (await verifyAssetDeletedFromServer(validatedAsset.id)) {
        await recordMediaEvent({
          type: "media-delete",
          description: `Deleted media: ${validatedAsset.name}`,
          affectedNodeIds: [validatedAsset.id],
        });
        return { ok: true, referenceCleanupNeeded: false };
      }

      rollbackDelete();
      await recordMediaEvent({
        type: "media-delete-failed",
        description: `Delete failed: ${validatedAsset.name}`,
        affectedNodeIds: [validatedAsset.id],
      });
      log("error", "[MediaView] Error deleting asset", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false };
    }
  }

  async function deleteAssetsBatch(assets: MediaAsset[]): Promise<{
    succeeded: number;
    failed: number;
    referenceCleanupNeeded: boolean;
  }> {
    let succeeded = 0;
    let failed = 0;
    let referenceCleanupNeeded = false;

    for (const asset of assets) {
      const result = await deleteAssetValidated(asset, {
        suppressReferenceWarning: true,
      });
      if (result.ok) {
        succeeded += 1;
        if (result.referenceCleanupNeeded) {
          referenceCleanupNeeded = true;
        }
      } else {
        failed += 1;
      }
    }

    return { succeeded, failed, referenceCleanupNeeded };
  }

  async function confirmDelete(): Promise<void> {
    if (!assetToDelete.value || isDeleting.value) return;

    isDeleting.value = true;

    try {
      const succeeded = await deleteAssetValidated(assetToDelete.value);
      if (succeeded.ok) {
        closeDeleteDialog(true);
        void loadAssets({ silent: true, force: true });
      }
    } finally {
      isDeleting.value = false;
    }
  }

  async function confirmDeleteBatch(assets: MediaAsset[]): Promise<{
    succeeded: number;
    failed: number;
    referenceCleanupNeeded: boolean;
  }> {
    if (assets.length === 0 || isDeleting.value) {
      return { succeeded: 0, failed: 0, referenceCleanupNeeded: false };
    }

    isDeleting.value = true;

    try {
      const result = await deleteAssetsBatch(assets);
      closeDeleteDialog(true);
      void loadAssets({ silent: true, force: true });
      return result;
    } finally {
      isDeleting.value = false;
    }
  }

  async function handleRename(asset: MediaAsset): Promise<void> {
    const parsedAsset = MediaAssetSchema.safeParse(asset);
    if (!parsedAsset.success) {
      log("error", "[MediaView] Invalid media asset payload for rename", {
        issues: parsedAsset.error.issues,
      });
      return;
    }

    const { baseName, extension } = splitFileName(asset.name);
    assetToRename.value = asset;
    renameInput.value = baseName;
    renameExtension.value = extension;
    renameReferenceCount.value = null;
    isRenameDialogOpen.value = true;
    void loadRenameReferenceCount(asset);
  }

  function closeRenameDialog(force = false): void {
    if (isRenaming.value && !force) return;
    isRenameDialogOpen.value = false;
    assetToRename.value = null;
    renameInput.value = "";
    renameExtension.value = "";
    renameReferenceCount.value = null;
  }

  function buildRenamedObjectKey(oldKey: string, newName: string): string {
    const pathParts = oldKey.split("/");
    pathParts.pop();
    return pathParts.length > 0 ? `${pathParts.join("/")}/${newName}` : newName;
  }

  function withPreviewCacheBust(url: string): string {
    if (!url) {
      return url;
    }

    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${Date.now()}`;
  }

  function buildRenameUrls(
    newPath: string,
    result?: Pick<RenameMediaResult, "url" | "publicUrl">,
    options?: { cacheBust?: boolean },
  ): Pick<MediaAsset, "url" | "publicUrl" | "deliveryUrl" | "thumbnailUrl"> {
    const rawUrl = result?.url ?? normalizeLogicalMediaPath(newPath);
    const rawPublicUrl = result?.publicUrl ?? rawUrl;
    const url = options?.cacheBust ? withPreviewCacheBust(rawUrl) : rawUrl;
    const publicUrl = options?.cacheBust
      ? withPreviewCacheBust(rawPublicUrl)
      : rawPublicUrl;

    return {
      url,
      publicUrl,
      deliveryUrl: url,
      thumbnailUrl: url,
    };
  }

  function patchAssetForRename(
    asset: MediaAsset,
    newPath: string,
    newName: string,
    result?: Pick<RenameMediaResult, "url" | "publicUrl">,
    options?: { preserveUrls?: boolean },
  ): MediaAsset {
    const identity = {
      id: newPath,
      name: newName,
      objectKey: newPath,
    };

    if (options?.preserveUrls) {
      return {
        ...asset,
        ...identity,
      };
    }

    return {
      ...asset,
      ...identity,
      ...buildRenameUrls(newPath, result),
    };
  }

  function syncCacheAfterRename(
    lookupIds: string[],
    result: RenameMediaResult,
    newName: string,
  ): void {
    const lookupSet = new Set(lookupIds);
    const staleIds = new Set(
      [result.oldPath, ...lookupIds].filter((id) => id !== result.newPath),
    );
    const urls = buildRenameUrls(result.newPath, result, { cacheBust: true });
    const next: MediaAsset[] = [];
    let merged = false;

    for (const asset of cachedAssets.value) {
      if (asset.id === result.newPath) {
        if (merged) {
          continue;
        }

        next.push({
          ...asset,
          id: result.newPath,
          name: newName,
          objectKey: result.newPath,
          ...urls,
        });
        merged = true;
        continue;
      }

      if (lookupSet.has(asset.id) || staleIds.has(asset.id)) {
        if (!merged) {
          next.push({
            ...asset,
            id: result.newPath,
            name: newName,
            objectKey: result.newPath,
            ...urls,
          });
          merged = true;
        }
        continue;
      }

      next.push(asset);
    }

    cachedAssets.value = next;
  }

  async function recoverRenamedAssetFromServer(
    originalId: string,
    newName: string,
  ): Promise<boolean> {
    let refreshedAssets: MediaAsset[];
    try {
      refreshedAssets = await loadSharedMediaAssets({
        force: true,
        source: "useMediaAssets.recoverRenamedAssetFromServer",
      });
    } catch {
      return false;
    }

    const expectedNewPath = buildRenamedObjectKey(originalId, newName);
    const renamedAsset = refreshedAssets.find(
      (asset) => asset.id === expectedNewPath || asset.name === newName,
    );
    const originalStillExists = refreshedAssets.some(
      (asset) => asset.id === originalId,
    );

    if (!renamedAsset || originalStillExists) {
      return false;
    }

    cachedAssets.value = refreshedAssets;
    return true;
  }

  async function resolveRenameActionResult(input: {
    data: unknown;
    oldPath: string;
    newName: string;
  }): Promise<ReturnType<typeof parseRenameMediaPayload>> {
    const parsed = parseRenameMediaPayload(input.data, {
      source: "useMediaAssets.queueMediaRename",
      oldPath: input.oldPath,
    });
    if (parsed) {
      return parsed;
    }

    let refreshedAssets: MediaAsset[];
    try {
      refreshedAssets = await loadSharedMediaAssets({
        force: true,
        source: "useMediaAssets.resolveRenameActionResult",
      });
    } catch {
      return null;
    }

    const expectedNewPath = buildRenamedObjectKey(input.oldPath, input.newName);
    const renamedAsset = refreshedAssets.find(
      (asset) => asset.id === expectedNewPath || asset.name === input.newName,
    );
    const originalStillExists = refreshedAssets.some(
      (asset) => asset.id === input.oldPath,
    );

    if (!renamedAsset || originalStillExists) {
      return null;
    }

    return {
      success: true,
      status: "completed",
      oldRetained: false,
      oldPath: input.oldPath,
      newPath: expectedNewPath,
      url: renamedAsset.url,
      publicUrl: renamedAsset.publicUrl ?? renamedAsset.url,
      references: createEmptyMediaMutationReferenceSummary(),
    };
  }

  function applyOptimisticRename(
    oldPath: string,
    newName: string,
  ): { newPath: string; rollback: () => void } {
    const newPath = buildRenamedObjectKey(oldPath, newName);
    const index = cachedAssets.value.findIndex((asset) => asset.id === oldPath);

    if (index === -1) {
      return { newPath, rollback: () => {} };
    }

    const snapshot = cachedAssets.value;
    const next = [...cachedAssets.value];
    next[index] = patchAssetForRename(
      cachedAssets.value[index]!,
      newPath,
      newName,
      undefined,
      { preserveUrls: true },
    );
    cachedAssets.value = next;

    return {
      newPath,
      rollback: () => {
        cachedAssets.value = snapshot;
      },
    };
  }

  function queueMediaRename(input: {
    asset: MediaAsset;
    newName: string;
  }): void {
    const originalAsset = input.asset;
    const originalId = originalAsset.id;
    const originalName = originalAsset.name;
    const newName = input.newName;
    const { rollback } = applyOptimisticRename(originalId, newName);

    void (async () => {
      let activePath = originalId;
      const incompleteState: { result: RenameMediaResult | null } = {
        result: null,
      };

      try {
        const executeResult = await executeMediaHistory({
          metadata: {
            type: "media-rename",
            description: `Renamed media: ${originalName} → ${newName}`,
            affectedNodeIds: [originalId],
          },
          redo: async () => {
            const payload = RenameMediaInputSchema.parse({
              oldPath: activePath,
              newName,
            });
            const { data, error } = await actions.media.rename(payload);

            if (error) {
              throw new Error(error.message);
            }

            const parsedResult = await resolveRenameActionResult({
              data,
              oldPath: activePath,
              newName,
            });
            if (!parsedResult) {
              throw new Error("Invalid rename response");
            }

            if (parsedResult.status === "incomplete") {
              incompleteState.result = parsedResult;
              throw new Error(
                "Rename is incomplete; both files were retained safely.",
              );
            }

            syncCacheAfterRename(
              [originalId, activePath, parsedResult.oldPath],
              parsedResult,
              newName,
            );

            activePath =
              parsedResult.newPath.length > 0
                ? parsedResult.newPath
                : activePath;
          },
          undo: async () => {
            const payload = RenameMediaInputSchema.parse({
              oldPath: activePath,
              newName: originalName,
            });
            const { data, error } = await actions.media.rename(payload);

            if (error) {
              throw new Error(error.message);
            }

            const parsedResult = await resolveRenameActionResult({
              data,
              oldPath: activePath,
              newName: originalName,
            });
            if (!parsedResult) {
              throw new Error("Invalid rename response");
            }

            if (parsedResult.status === "incomplete") {
              incompleteState.result = parsedResult;
              throw new Error(
                "Rename is incomplete; both files were retained safely.",
              );
            }

            syncCacheAfterRename(
              [activePath, parsedResult.oldPath],
              parsedResult,
              originalName,
            );

            activePath =
              parsedResult.newPath.length > 0
                ? parsedResult.newPath
                : activePath;
          },
        });

        if (!executeResult.success) {
          if (incompleteState.result) {
            await loadAssets({ silent: true, force: true });
            await recordMediaEvent({
              type: "media-rename-failed",
              description: `Rename incomplete; both files retained: ${originalName} → ${newName}`,
              affectedNodeIds: [originalId, incompleteState.result.newPath],
            });
            toast.warning(
              "Rename is incomplete. Both files were retained so remaining references can be repaired.",
            );
            return;
          }
          if (await recoverRenamedAssetFromServer(originalId, newName)) {
            await loadAssets({ silent: true, force: true });
            return;
          }

          rollback();
          await recordMediaEvent({
            type: "media-rename-failed",
            description: `Rename failed: ${originalName} → ${newName}`,
            affectedNodeIds: [originalId],
          });
          toast.error(executeResult.error ?? "Failed to rename media");
          log("error", "[MediaView] Rename error", {
            error: executeResult.error ?? "Failed to execute rename",
          });
          return;
        }

        await loadAssets({ silent: true, force: true });
      } catch (err) {
        if (await recoverRenamedAssetFromServer(originalId, newName)) {
          await loadAssets({ silent: true, force: true });
          return;
        }

        rollback();
        await recordMediaEvent({
          type: "media-rename-failed",
          description: `Rename failed: ${originalName} → ${newName}`,
          affectedNodeIds: [originalId],
        });
        toast.error(
          err instanceof Error ? err.message : "Failed to rename media",
        );
        log("error", "[MediaView] Error renaming asset", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }

  function commitMediaRename(
    asset: MediaAsset,
    proposedBaseName: string,
    extension: string,
  ): boolean {
    const trimmedBaseName = proposedBaseName.trim();
    if (!trimmedBaseName) {
      return false;
    }

    const { baseName: currentBaseName } = splitFileName(asset.name);
    if (trimmedBaseName === currentBaseName) {
      return false;
    }

    queueMediaRename({
      asset,
      newName: `${trimmedBaseName}${extension}`,
    });
    return true;
  }

  async function confirmRename(): Promise<void> {
    if (!assetToRename.value) return;

    const asset = assetToRename.value;
    const proposedBaseName = renameInput.value.trim();
    if (!proposedBaseName) {
      return;
    }

    const { baseName: currentBaseName } = splitFileName(asset.name);
    if (proposedBaseName === currentBaseName) {
      closeRenameDialog();
      return;
    }

    const committed = commitMediaRename(
      asset,
      proposedBaseName,
      renameExtension.value,
    );
    if (committed) {
      closeRenameDialog(true);
    }
  }

  async function handleDuplicate(asset: MediaAsset): Promise<void> {
    const parsedAsset = MediaAssetSchema.safeParse(asset);
    if (!parsedAsset.success) {
      log("error", "[MediaView] Invalid media asset payload for duplicate", {
        issues: parsedAsset.error.issues,
      });
      return;
    }

    const validatedAsset = parsedAsset.data;

    try {
      let duplicatedPath: string | null = null;
      let duplicateNameForRedo: string | undefined;

      const executeResult = await executeMediaHistory({
        metadata: {
          type: "media-duplicate",
          description: `Duplicated media: ${validatedAsset.name}`,
          affectedNodeIds: [validatedAsset.id],
        },
        redo: async () => {
          const payload = DuplicateMediaInputSchema.parse({
            path: validatedAsset.id,
            newName: duplicateNameForRedo,
          });

          const { data, error } = await actions.media.duplicate(payload);

          if (error) {
            throw new Error(error.message);
          }

          const parsedResult = DuplicateMediaResultSchema.safeParse(data);
          if (!parsedResult.success) {
            throw new Error(
              parsedResult.error.issues[0]?.message ??
                "Invalid duplicate response",
            );
          }

          duplicatedPath =
            parsedResult.data.newPath.length > 0
              ? parsedResult.data.newPath
              : null;

          if (duplicatedPath && !duplicateNameForRedo) {
            duplicateNameForRedo = duplicatedPath.split("/").pop();
          }

          await loadAssets({ silent: true, force: true });
        },
        undo: async () => {
          if (!duplicatedPath) {
            return;
          }

          const payload = DeleteMediaInputSchema.parse({
            path: duplicatedPath,
          });
          const { data, error } = await actions.media.delete(payload);

          if (error) {
            throw new Error(error.message);
          }

          if (!parseDeleteResult(duplicatedPath, data).ok) {
            throw new Error("Invalid delete response");
          }

          await loadAssets({ silent: true, force: true });
        },
      });

      if (!executeResult.success) {
        await recordMediaEvent({
          type: "media-duplicate-failed",
          description: `Duplicate failed: ${validatedAsset.name}`,
          affectedNodeIds: [validatedAsset.id],
        });
        log("error", "[MediaView] Duplicate error", {
          error: executeResult.error ?? "Failed to execute duplicate",
        });
        return;
      }
    } catch (err) {
      await recordMediaEvent({
        type: "media-duplicate-failed",
        description: `Duplicate failed: ${validatedAsset.name}`,
        affectedNodeIds: [validatedAsset.id],
      });
      log("error", "[MediaView] Error duplicating asset", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    assets,
    isLoading,
    isUploading,
    isRenameDialogOpen,
    assetToRename,
    renameInput,
    renameExtension,
    renameReferenceCount,
    isRenaming,
    isDeleteDialogOpen,
    assetToDelete,
    isDeleting,
    loadAssets,
    handleUpload,
    handleCopyUrl,
    handleDelete,
    closeDeleteDialog,
    confirmDelete,
    confirmDeleteBatch,
    deleteAssetsBatch,
    handleRename,
    closeRenameDialog,
    commitMediaRename,
    confirmRename,
    handleDuplicate,
    canDeleteMedia,
  };
}
