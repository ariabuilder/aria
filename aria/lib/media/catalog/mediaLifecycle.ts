import { validateSafeMediaFilename } from "../utils/action-validators";
import type { EndpointId } from "../endpoints/registry";
import { computeSHA256 } from "../utils/checksum";
import { normalizeLogicalMediaPath } from "../utils/path";
import type { MediaAssetAuthorshipContext } from "./authorshipSchemas";
import { MediaLifecycleError } from "./mediaLifecycleErrors";
import {
  updateMediaReferencesForPath,
  type UpdateMediaReferencesContext,
} from "./updateMediaReferences";
import type { StorageAdapter } from "../../storage/adapter";
import { log as baseLog } from "../../utils/logger";
import {
  createEmptyMediaMutationReferenceSummary,
  DeleteMediaResultSchema,
  MediaMutationReferenceSummarySchema,
  RenameMediaResultSchema,
  toMediaMutationReferenceSummary,
  type MediaMutationReferenceSummary,
  type DeleteMediaResult,
  type RenameMediaResult,
} from "../../schemas/mediaMutations";

const REFERENCE_CLEANUP_WARNING =
  "Some references may need manual cleanup after deleting this asset.";

const RENAME_INCOMPLETE_WARNING =
  "Rename is incomplete. Both files were retained so remaining references can be repaired safely.";

const TARGET_EXISTS_MESSAGE =
  "A file with that name already exists in this folder.";

const TARGET_TRANSFORMS_EXIST_MESSAGE =
  "Saved image edits already exist for the destination filename.";

function hasTransformState(
  state: Awaited<ReturnType<StorageAdapter["getMediaTransformState"]>>,
): boolean {
  return Boolean(
    state.profile ||
    state.sourceVersions.length > 0 ||
    state.variants.length > 0,
  );
}

function withReferenceWarning(
  summary: MediaMutationReferenceSummary,
  warning: string,
): MediaMutationReferenceSummary {
  return MediaMutationReferenceSummarySchema.parse({
    ...summary,
    warnings: summary.warnings.includes(warning)
      ? summary.warnings
      : [...summary.warnings, warning],
  });
}

function getExtension(filename: string): string | undefined {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return undefined;
  }

  return filename.slice(dotIndex + 1).toLowerCase();
}

function inferContentTypeFromFilename(filename: string): string | undefined {
  const extension = getExtension(filename);

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "ico":
      return "image/x-icon";
    case "avif":
      return "image/avif";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "pdf":
      return "application/pdf";
    case "woff2":
      return "font/woff2";
    case "woff":
      return "font/woff";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    default:
      return undefined;
  }
}

function buildNewObjectKey(oldKey: string, newName: string): string {
  const pathParts = oldKey.split("/");
  pathParts.pop();
  return pathParts.length > 0 ? `${pathParts.join("/")}/${newName}` : newName;
}

export async function scrubReferencesForDeletedMedia(
  adapter: StorageAdapter,
  context: UpdateMediaReferencesContext,
  logicalPath: string,
): Promise<MediaMutationReferenceSummary> {
  try {
    const result = await updateMediaReferencesForPath(adapter, context, {
      mode: "scrub",
      logicalPath,
      fallback: "",
    });
    const summary = toMediaMutationReferenceSummary(result);
    if (
      summary.failures.length > 0 &&
      !summary.warnings.includes(REFERENCE_CLEANUP_WARNING)
    ) {
      return MediaMutationReferenceSummarySchema.parse({
        ...summary,
        warnings: [...summary.warnings, REFERENCE_CLEANUP_WARNING],
      });
    }
    return summary;
  } catch {
    return MediaMutationReferenceSummarySchema.parse({
      ...createEmptyMediaMutationReferenceSummary(),
      warnings: [REFERENCE_CLEANUP_WARNING],
    });
  }
}

export async function deleteMediaWithReferenceSafety(
  adapter: StorageAdapter,
  context: UpdateMediaReferencesContext,
  input: {
    objectKey: string;
    logicalPath: string;
    updatedAt: string;
    catalogAuthorship?: MediaAssetAuthorshipContext;
  },
): Promise<DeleteMediaResult> {
  const transformState = await adapter.getMediaTransformState(
    input.logicalPath,
  );
  const references = await scrubReferencesForDeletedMedia(
    adapter,
    context,
    input.logicalPath,
  );
  if (references.failures.length > 0 || references.warnings.length > 0) {
    return DeleteMediaResultSchema.parse({
      success: true,
      status: "incomplete",
      deleted: false,
      references,
    });
  }

  await adapter.deleteMedia(input.objectKey);
  const cleanupWarnings: string[] = [];
  for (const source of transformState.sourceVersions) {
    if (source.objectKey === input.objectKey) continue;
    try {
      await adapter.deleteMedia(source.objectKey);
    } catch (error) {
      cleanupWarnings.push(
        `Source version ${source.version} cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  try {
    await adapter.deleteMediaTransformState(input.logicalPath);
  } catch (error) {
    cleanupWarnings.push(
      `Saved image edit cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    await adapter.markMediaCatalogAssetDeleted(
      { logicalPath: input.logicalPath, updatedAt: input.updatedAt },
      input.catalogAuthorship,
    );
  } catch (error) {
    cleanupWarnings.push(
      `Catalog cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return DeleteMediaResultSchema.parse({
    success: true,
    status: cleanupWarnings.length === 0 ? "completed" : "incomplete",
    deleted: true,
    references: MediaMutationReferenceSummarySchema.parse({
      ...references,
      warnings: cleanupWarnings,
    }),
  });
}

export type RenameMediaWithReferenceMigrationInput = {
  oldKey: string;
  newName: string;
  endpointId: EndpointId;
  catalogAuthorship?: MediaAssetAuthorshipContext;
};

export async function renameMediaWithReferenceMigration(
  adapter: StorageAdapter,
  context: UpdateMediaReferencesContext,
  input: RenameMediaWithReferenceMigrationInput,
): Promise<RenameMediaResult> {
  const oldKey = input.oldKey;
  const oldLogicalPath = normalizeLogicalMediaPath(oldKey);
  const safeNewName = validateSafeMediaFilename(input.newName);
  const newPath = buildNewObjectKey(oldKey, safeNewName);
  const newLogicalPath = normalizeLogicalMediaPath(newPath);
  if (newLogicalPath === oldLogicalPath) {
    throw new MediaLifecycleError(
      "CONFLICT",
      "The new filename must be different from the current filename.",
    );
  }

  const buffer = await adapter.getMedia(oldKey);
  if (!buffer) {
    throw new MediaLifecycleError("NOT_FOUND", `Media not found: ${oldKey}`);
  }

  const checksum = computeSHA256(buffer);
  const existingAtTarget = await adapter.getMedia(newPath);
  const isResuming = Boolean(
    existingAtTarget && computeSHA256(existingAtTarget) === checksum,
  );
  if (existingAtTarget && !isResuming) {
    throw new MediaLifecycleError("CONFLICT", TARGET_EXISTS_MESSAGE);
  }

  const [
    sourceCatalogRows,
    targetCatalogRows,
    sourceTransforms,
    targetTransforms,
  ] = await Promise.all([
    adapter.listMediaCatalogAssetsByLogicalPaths([oldLogicalPath]),
    adapter.listMediaCatalogAssetsByLogicalPaths([newLogicalPath]),
    adapter.getMediaTransformState(oldLogicalPath),
    adapter.getMediaTransformState(newLogicalPath),
  ]);
  const sourceCatalog = sourceCatalogRows[0];
  const targetCatalog = targetCatalogRows[0];
  if (
    targetCatalog &&
    (!isResuming || (sourceCatalog && sourceCatalog.id !== targetCatalog.id))
  ) {
    throw new MediaLifecycleError("CONFLICT", TARGET_EXISTS_MESSAGE);
  }
  if (
    hasTransformState(targetTransforms) &&
    (!isResuming || hasTransformState(sourceTransforms))
  ) {
    throw new MediaLifecycleError("CONFLICT", TARGET_TRANSFORMS_EXIST_MESSAGE);
  }

  const publicUrl = isResuming
    ? (targetCatalog?.public_url ?? newLogicalPath)
    : await adapter.saveMedia(newPath, buffer, {
        contentType: inferContentTypeFromFilename(safeNewName),
      });

  let references: MediaMutationReferenceSummary;
  try {
    const referenceUpdate = await updateMediaReferencesForPath(
      adapter,
      context,
      {
        mode: "migrate",
        logicalPath: oldLogicalPath,
        newLogicalPath,
      },
    );
    references = toMediaMutationReferenceSummary(referenceUpdate);
  } catch (error) {
    baseLog("warn", "[media.rename] reference migration aborted", {
      oldLogicalPath,
      newLogicalPath,
      error: error instanceof Error ? error.message : String(error),
    });
    references = withReferenceWarning(
      createEmptyMediaMutationReferenceSummary(),
      RENAME_INCOMPLETE_WARNING,
    );
  }

  if (references.failures.length > 0 || references.warnings.length > 0) {
    return RenameMediaResultSchema.parse({
      success: true,
      status: "incomplete",
      oldRetained: true,
      oldPath: oldKey,
      newPath,
      url: newLogicalPath,
      publicUrl,
      references: withReferenceWarning(references, RENAME_INCOMPLETE_WARNING),
    });
  }

  const timestamp = new Date().toISOString();
  try {
    await adapter.moveMediaCatalogAsset(
      {
        oldLogicalPath,
        newLogicalPath,
        filename: safeNewName,
        extension: getExtension(safeNewName),
        sizeBytes: buffer.byteLength,
        checksumSha256: checksum,
        endpointId: input.endpointId,
        publicUrl,
        objectKey: newPath,
        updatedAt: timestamp,
      },
      input.catalogAuthorship,
    );
  } catch (error) {
    baseLog("warn", "[media.rename] catalog move failed", {
      oldLogicalPath,
      newLogicalPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return RenameMediaResultSchema.parse({
      success: true,
      status: "incomplete",
      oldRetained: true,
      oldPath: oldKey,
      newPath,
      url: newLogicalPath,
      publicUrl,
      references: withReferenceWarning(references, RENAME_INCOMPLETE_WARNING),
    });
  }

  try {
    if (hasTransformState(sourceTransforms)) {
      await adapter.moveMediaTransformState(oldLogicalPath, newLogicalPath);
    }
    await adapter.deleteMedia(oldKey);
  } catch (error) {
    baseLog("warn", "[media.rename] source cleanup failed", {
      oldLogicalPath,
      newLogicalPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return RenameMediaResultSchema.parse({
      success: true,
      status: "incomplete",
      oldRetained: true,
      oldPath: oldKey,
      newPath,
      url: newLogicalPath,
      publicUrl,
      references: withReferenceWarning(references, RENAME_INCOMPLETE_WARNING),
    });
  }

  return RenameMediaResultSchema.parse({
    success: true,
    status: "completed",
    oldRetained: false,
    oldPath: oldKey,
    newPath,
    url: newLogicalPath,
    publicUrl,
    references,
  });
}
