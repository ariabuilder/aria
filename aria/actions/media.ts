/**
 * Media/asset actions for local SQLite storage and Cloudflare R2.
 */

import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import {
  buildAuthorshipSaveContext,
  requireOperation,
  resolveAuthorizedMediaMutation,
} from "./_shared";
import type { ActionAPIContext } from "astro:actions";
import type { StorageAdapter } from "../lib/storage/adapter";
import { log as baseLog } from "../lib/utils/logger";
import {
  MediaSyncApplyInputSchema,
  MediaSyncHistoryInputSchema,
  MediaSyncHistoryResponseSchema,
  MediaSyncPlanInputSchema,
  type MediaSyncPlanInput,
} from "../lib/media/types";
import {
  getEndpointRegistry,
  assertEndpointId,
  type EndpointId,
} from "../lib/media/endpoints/registry";
import { MediaSyncPlanner } from "../lib/media/sync/planner";
import { MediaSyncRepository } from "../lib/media/sync/repository";
import { MediaSyncExecutor } from "../lib/media/sync/executor";
import {
  emitMediaHistoryEvent,
  emitMediaSyncHistoryEvent,
} from "../lib/media/sync/history";
import { computeSHA256 } from "../lib/media/utils/checksum";
import { createStoredMediaFilename } from "../lib/media/utils/filename";
import {
  logicalPathToObjectKey,
  normalizeLogicalMediaPath,
} from "../lib/media/utils/path";

import { MediaCatalogRepository } from "../lib/media/catalog/repository";
import {
  validateMediaObjectKey,
  validateSafeMediaFilename,
} from "../lib/media/utils/action-validators";
import {
  resolveUniqueFontStoragePath,
  sanitizeFontFilename,
} from "../lib/media/utils/font-filenames";
import {
  exceedsMediaTransformInputLimit,
  MEDIA_UPLOAD_MAX_BYTES,
  getMediaTransformInputTooLargeMessage,
  getMediaUploadTooLargeMessage,
} from "../lib/media/uploadLimits";
import {
  deleteMediaWithReferenceSafety,
  renameMediaWithReferenceMigration,
} from "../lib/media/catalog/mediaLifecycle";
import { MediaLifecycleError } from "../lib/media/catalog/mediaLifecycleErrors";
import { DeleteMediaResultSchema } from "../lib/schemas/mediaMutations";
import {
  downloadRemoteResource,
  RemoteDownloadError,
} from "../lib/security/remoteDownload";
import {
  SaveMediaAssetProfileInputSchema,
  SaveMediaTransformVariantInputSchema,
  SaveMediaTransformVariantResultSchema,
} from "../lib/media/transforms/schemas";
import { MediaTransformConflictError } from "../lib/media/transforms/storage";
import { rebuildMediaUsageBatch } from "../lib/media/catalog/rebuildUsage";
import { findComposerVariantUsage } from "../lib/media/transforms/composerUsage";
import {
  buildMediaSourceVersionObjectKey,
  inspectImageSource,
  type InspectedImageSource,
} from "../lib/media/transforms/sourceInspection";
import { replaceMediaSource } from "../lib/media/transforms/sourceLifecycle";

async function getAdapter(context: ActionAPIContext): Promise<StorageAdapter> {
  return getStorageAdapterAsync(context.locals);
}

function getCatalogRepository(
  context: ActionAPIContext,
): MediaCatalogRepository | null {
  return MediaCatalogRepository.tryCreate(context.locals);
}

/**
 * Determine media type from MIME type or extension
 */
function getMediaType(
  mimeType?: string,
  filename?: string,
): "image" | "video" | "icon" | "document" | "archive" | "other" {
  if (mimeType) {
    if (
      mimeType === "image/svg+xml" ||
      mimeType === "image/x-icon" ||
      mimeType === "image/vnd.microsoft.icon" ||
      mimeType === "image/ico" ||
      mimeType === "image/icon"
    )
      return "icon";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (
      mimeType.includes("pdf") ||
      mimeType.includes("document") ||
      mimeType.includes("msword") ||
      mimeType.includes("spreadsheet")
    )
      return "document";
    if (mimeType.includes("zip") || mimeType.includes("archive"))
      return "archive";
  }

  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (["svg", "ico"].includes(ext || "")) return "icon";
    if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext || ""))
      return "image";
    if (["mp4", "webm", "mov", "avi"].includes(ext || "")) return "video";
    if (
      ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext || "")
    )
      return "document";
    if (["zip", "tar", "gz", "rar", "7z"].includes(ext || "")) return "archive";
  }

  return "other";
}

function isFontUpload(file: File): boolean {
  const name = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();
  return (
    [".woff2", ".woff", ".ttf", ".otf", ".eot"].some((extension) =>
      name.endsWith(extension),
    ) ||
    mimeType.startsWith("font/") ||
    mimeType.includes("font")
  );
}

function isCloudflareAdapter(adapter: StorageAdapter): boolean {
  return adapter.constructor?.name === "CloudflareStorageAdapter";
}

function inferUploadEndpointId(adapter: StorageAdapter): EndpointId {
  return isCloudflareAdapter(adapter) ? "cloudflare-r2" : "local-fs";
}

function getFilenameFromLogicalPath(logicalPath: string): string {
  const segments = logicalPath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? logicalPath;
}

function getExtension(filename: string): string | undefined {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return undefined;
  }

  return filename.slice(dotIndex + 1).toLowerCase();
}

function assertSafeMediaFilename(rawName: string): string {
  try {
    return validateSafeMediaFilename(rawName);
  } catch (error) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Invalid filename",
    });
  }
}

function assertMediaUploadSize(file: File): void {
  if (file.size > MEDIA_UPLOAD_MAX_BYTES) {
    throw new ActionError({
      code: "CONTENT_TOO_LARGE",
      message: getMediaUploadTooLargeMessage(file.name),
    });
  }

  if (exceedsMediaTransformInputLimit(file)) {
    throw new ActionError({
      code: "CONTENT_TOO_LARGE",
      message: getMediaTransformInputTooLargeMessage(file.name),
    });
  }
}

function assertMediaObjectKey(rawPath: string): string {
  try {
    return validateMediaObjectKey(rawPath);
  } catch (error) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Invalid media path",
    });
  }
}

async function saveUploadedMediaBuffer(
  adapter: StorageAdapter,
  file: File,
  buffer: Buffer,
): Promise<string> {
  const contentType = file.type || undefined;

  if (isFontUpload(file)) {
    return adapter.saveMedia(
      await resolveUniqueFontStoragePath(
        (path) => adapter.getMedia(path),
        file.name,
      ),
      buffer,
      { contentType },
    );
  }

  return adapter.saveMedia(createStoredMediaFilename(file.name), buffer, {
    contentType,
  });
}

async function registerUploadedMediaMetadata(input: {
  adapter: StorageAdapter;
  logicalPath: string;
  publicUrl: string;
  file: File;
  buffer: Buffer;
  endpointId: EndpointId;
  inspection: InspectedImageSource | null;
  authorship: NonNullable<
    Parameters<StorageAdapter["upsertMediaCatalogAsset"]>[1]
  >;
}): Promise<void> {
  const filename = getFilenameFromLogicalPath(input.logicalPath);
  const extension = getExtension(filename);
  const checksum = computeSHA256(input.buffer);
  const timestamp = new Date().toISOString();
  const { inspection } = input;
  const sourceObjectKey = inspection
    ? buildMediaSourceVersionObjectKey({
        assetPath: input.logicalPath,
        version: 1,
        checksumSha256: checksum,
        mimeType: inspection.mimeType,
      })
    : logicalPathToObjectKey(input.logicalPath);

  if (inspection) {
    await input.adapter.saveMedia(sourceObjectKey, input.buffer, {
      contentType: inspection.mimeType,
    });
  }

  await input.adapter.registerMediaSourceVersion({
    assetPath: input.logicalPath,
    version: 1,
    objectKey: sourceObjectKey,
    checksumSha256: checksum,
    mimeType: inspection?.mimeType ?? (input.file.type || null),
    sizeBytes: input.file.size,
    width: inspection?.width ?? null,
    height: inspection?.height ?? null,
    createdAt: timestamp,
  });

  await input.adapter.upsertMediaCatalogAsset(
    {
      logicalPath: input.logicalPath,
      filename,
      extension,
      mimeType: inspection?.mimeType ?? (input.file.type || undefined),
      sizeBytes: input.file.size,
      checksumSha256: checksum,
      endpointId: input.endpointId,
      objectKey: logicalPathToObjectKey(input.logicalPath),
      publicUrl: input.publicUrl,
      updatedAt: timestamp,
    },
    input.authorship,
  );
}

function resolveEndpointPair(input: MediaSyncPlanInput): {
  sourceEndpointId: EndpointId;
  targetEndpointId: EndpointId;
} {
  const defaultPair =
    input.direction === "push"
      ? {
          sourceEndpointId: "local-fs" as const,
          targetEndpointId: "cloudflare-r2" as const,
        }
      : {
          sourceEndpointId: "cloudflare-r2" as const,
          targetEndpointId: "local-fs" as const,
        };

  const sourceCandidate =
    input.sourceEndpointId ?? defaultPair.sourceEndpointId;
  const targetCandidate =
    input.targetEndpointId ?? defaultPair.targetEndpointId;

  assertEndpointId(sourceCandidate);
  assertEndpointId(targetCandidate);

  return {
    sourceEndpointId: sourceCandidate,
    targetEndpointId: targetCandidate,
  };
}

function parseSummary(summaryJson?: string): {
  total: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  conflicted: number;
  failed: number;
} {
  return MediaSyncRepository.parseSummary(summaryJson);
}

async function assertMediaActionRateLimit(input: {
  context: ActionAPIContext;
  actorId: string;
  action: "delete" | "rename" | "duplicate" | "sync-apply";
  maxRequests: number;
  windowMs: number;
}): Promise<void> {
  const adapter = await getAdapter(input.context);
  const result = await adapter.consumeRateLimit({
    scope: `media-action:${input.action}`,
    subject: input.actorId,
    limit: input.maxRequests,
    windowMs: input.windowMs,
  });

  if (!result.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.resetAt - Date.now()) / 1000),
    );
    throw new ActionError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded for ${input.action}. Try again in ${retryAfterSeconds}s.`,
    });
  }
}

import { handleListMedia, ListMediaInputSchema } from "./mediaListHandler";

export { handleListMedia } from "./mediaListHandler";

export const media = {
  /**
   * List all media assets
   *
   * Returns all media files from the storage backend (local filesystem or R2).
   * Includes metadata like size, type, and creation date.
   */
  list: defineAction({
    accept: "json",
    input: ListMediaInputSchema,
    handler: handleListMedia,
  }),

  usages: defineAction({
    accept: "json",
    input: z.object({
      logicalPath: z.string().min(1),
    }),
    handler: async ({ logicalPath }, context) => {
      await requireOperation(context, "media.usages");

      try {
        const adapter = await getAdapter(context);

        if (typeof adapter.listMediaUsageByLogicalPath !== "function") {
          return {
            available: false,
            source: "unavailable" as const,
            usages: [],
          };
        }

        const usages = await adapter.listMediaUsageByLogicalPath(logicalPath);

        return {
          available: true,
          source: "indexed" as const,
          usages,
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        baseLog("error", "[media.usages] Error", {
          logicalPath,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load media usage",
        });
      }
    },
  }),

  rebuildUsageIndex: defineAction({
    accept: "json",
    input: z.object({
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    handler: async (input, context) => {
      await requireOperation(context, "media.rebuildUsageIndex");
      try {
        return await rebuildMediaUsageBatch(await getAdapter(context), input);
      } catch (error) {
        if (error instanceof ActionError) throw error;
        baseLog("error", "[media.rebuildUsageIndex] Error", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Failed to rebuild media usage index",
        });
      }
    },
  }),

  getTransformState: defineAction({
    accept: "json",
    input: z.object({ assetPath: z.string().min(1) }),
    handler: async ({ assetPath }, context) => {
      await requireOperation(context, "media.getTransformState");
      const adapter = await getAdapter(context);
      return adapter.getMediaTransformState(assetPath);
    },
  }),

  saveProfile: defineAction({
    accept: "json",
    input: SaveMediaAssetProfileInputSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMediaMutation(
        context,
        "media.saveProfile",
        "update",
      );
      try {
        const adapter = await getAdapter(context);
        return await adapter.saveMediaAssetProfile(input);
      } catch (error) {
        if (error instanceof MediaTransformConflictError) {
          throw new ActionError({ code: "CONFLICT", message: error.message });
        }
        throw error;
      }
    },
  }),

  saveTransformVariant: defineAction({
    accept: "json",
    input: SaveMediaTransformVariantInputSchema,
    handler: async (input, context) => {
      await resolveAuthorizedMediaMutation(
        context,
        "media.saveTransformVariant",
        "update",
      );
      try {
        const adapter = await getAdapter(context);
        const existingVariant = await adapter.getMediaTransformVariant(
          input.id,
        );
        if (existingVariant) {
          const usages = await findComposerVariantUsage(adapter, input.id);
          if (usages.length > 0) {
            throw new ActionError({
              code: "CONFLICT",
              message:
                "This variant is used in Composer. Replace those placements before editing or rebasing it.",
            });
          }
        }
        const currentState = await adapter.getMediaTransformState(
          input.assetPath,
        );
        const profile =
          currentState.profile ??
          (await adapter.saveMediaAssetProfile({
            assetPath: input.assetPath,
            currentSourceVersion: input.sourceVersion,
            altText: null,
            title: null,
            caption: null,
            credit: null,
            copyright: null,
            focalPoint: input.focalPoint,
          }));
        const variant = await adapter.saveMediaTransformVariant(input);
        return SaveMediaTransformVariantResultSchema.parse({
          profile,
          variant,
        });
      } catch (error) {
        if (error instanceof MediaTransformConflictError) {
          throw new ActionError({ code: "CONFLICT", message: error.message });
        }
        throw error;
      }
    },
  }),

  deleteTransformVariant: defineAction({
    accept: "json",
    input: z.object({
      assetPath: z.string().min(1),
      id: z.string().min(1),
    }),
    handler: async ({ assetPath, id }, context) => {
      await resolveAuthorizedMediaMutation(
        context,
        "media.deleteTransformVariant",
        "update",
      );
      const adapter = await getAdapter(context);
      const usages = await findComposerVariantUsage(adapter, id);
      if (usages.length > 0) {
        throw new ActionError({
          code: "CONFLICT",
          message:
            "This variant is used in Composer. Replace those placements before deleting it.",
        });
      }
      await adapter.deleteMediaTransformVariant(assetPath, id);
      return { success: true as const };
    },
  }),

  /**
   * Upload a new media file
   *
   * Accepts multipart form data with a file.
   * Stores in local /public/uploads or Cloudflare R2 depending on environment.
   */
  upload: defineAction({
    accept: "form",
    input: z.object({
      file: z.instanceof(File),
    }),
    handler: async ({ file }, context) => {
      const { user: actor, authorship } = await resolveAuthorizedMediaMutation(
        context,
        "media.upload",
        "create",
      );
      assertSafeMediaFilename(file.name);
      assertMediaUploadSize(file);

      try {
        const adapter = await getAdapter(context);
        const buffer = Buffer.from(await file.arrayBuffer());
        const publicUrl = await saveUploadedMediaBuffer(adapter, file, buffer);
        const logicalPath = normalizeLogicalMediaPath(publicUrl);
        const endpointId = inferUploadEndpointId(adapter);
        const filename = getFilenameFromLogicalPath(logicalPath);
        const inspection =
          getMediaType(file.type, file.name) === "image"
            ? inspectImageSource(buffer)
            : null;

        // The file is already safely stored at this point. Catalog and source
        // metadata improves media management, but the filesystem/R2 listing is
        // deliberately able to discover unindexed files. Do not make a usable
        // upload fail when that secondary write is temporarily unavailable.
        try {
          await registerUploadedMediaMetadata({
            adapter,
            logicalPath,
            publicUrl,
            file,
            buffer,
            endpointId,
            inspection,
            authorship,
          });
        } catch (metadataError) {
          baseLog("warn", "[media.upload] Metadata registration failed", {
            fileName: file.name,
            logicalPath,
            error:
              metadataError instanceof Error
                ? metadataError.message
                : String(metadataError),
          });
        }

        emitMediaHistoryEvent({
          type: "media-upload",
          actorId: actor.id,
          timestamp: new Date().toISOString(),
          assetId: file.name,
          result: { success: true },
          details: {
            filename: file.name,
            url: logicalPath,
            sizeBytes: file.size,
            mimeType: file.type || undefined,
          },
        });

        return {
          success: true,
          url: logicalPath,
          publicUrl,
          name: isFontUpload(file) ? sanitizeFontFilename(file.name) : filename,
          size: file.size,
          type: getMediaType(file.type, file.name),
          endpointId,
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;

        emitMediaHistoryEvent({
          type: "media-upload-failed",
          actorId: actor.id,
          timestamp: new Date().toISOString(),
          assetId: file.name,
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          details: {
            filename: file.name,
            sizeBytes: file.size,
            mimeType: file.type || undefined,
          },
        });

        baseLog("error", "[media.upload] Error", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload media",
        });
      }
    },
  }),

  replaceSource: defineAction({
    accept: "form",
    input: z.object({
      assetPath: z.string().min(1),
      file: z.instanceof(File),
      expectedUpdatedAt: z.string().optional(),
    }),
    handler: async ({ assetPath, file, expectedUpdatedAt }, context) => {
      const { user: actor, authorship } = await resolveAuthorizedMediaMutation(
        context,
        "media.replaceSource",
        "update",
      );
      assertMediaUploadSize(file);
      try {
        const adapter = await getAdapter(context);
        const result = await replaceMediaSource(adapter, {
          assetPath,
          source: Buffer.from(await file.arrayBuffer()),
          contentType: file.type || undefined,
          endpointId: inferUploadEndpointId(adapter),
          expectedUpdatedAt: expectedUpdatedAt || undefined,
          catalogAuthorship: authorship,
        });
        emitMediaHistoryEvent({
          type: "media-source-replace",
          actorId: actor.id,
          timestamp: new Date().toISOString(),
          assetId: assetPath,
          result: {
            success: true,
            cleanupComplete: result.status === "completed",
          },
          details: {
            fromVersion: result.previousSourceVersion,
            toVersion: result.currentSourceVersion,
            promoted: result.promoted,
            variantsNeedingRebase: result.variants.needsRebase,
          },
        });
        return result;
      } catch (error) {
        if (error instanceof MediaTransformConflictError) {
          throw new ActionError({ code: "CONFLICT", message: error.message });
        }
        if (error instanceof ActionError) throw error;
        baseLog("error", "[media.replaceSource] Error", {
          assetPath,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Failed to replace the media source",
        });
      }
    },
  }),

  /**
   * Delete a media file
   *
   * Removes file from storage (local filesystem or R2).
   */
  delete: defineAction({
    accept: "json",
    input: z.object({
      path: z.string(),
    }),
    handler: async ({ path }, context) => {
      const { user: actor, authorship } = await resolveAuthorizedMediaMutation(
        context,
        "media.delete",
        "delete",
      );
      const referenceAuthorship = buildAuthorshipSaveContext(
        actor,
        "save-page",
      );
      const objectKey = assertMediaObjectKey(path);
      const logicalPath = normalizeLogicalMediaPath(objectKey);
      await assertMediaActionRateLimit({
        context,
        actorId: actor.id,
        action: "delete",
        maxRequests: 30,
        windowMs: 60_000,
      });

      try {
        const adapter = await getAdapter(context);
        const timestamp = new Date().toISOString();

        const result = await deleteMediaWithReferenceSafety(
          adapter,
          { locals: context.locals, authorship: referenceAuthorship },
          {
            objectKey,
            logicalPath,
            updatedAt: timestamp,
            catalogAuthorship: authorship,
          },
        );

        if (!result.deleted) {
          baseLog("warn", "[media.delete] reference scrub partial failure", {
            logicalPath,
            failures: result.references.failures,
          });
          return result;
        }

        emitMediaHistoryEvent({
          type: "media-delete",
          actorId: actor.id,
          timestamp: new Date().toISOString(),
          assetId: objectKey,
          result: {
            success: true,
            cleanupComplete: result.status === "completed",
          },
          details: {
            fromKey: objectKey,
          },
        });

        return DeleteMediaResultSchema.parse(result);
      } catch (error) {
        if (error instanceof ActionError) throw error;

        emitMediaHistoryEvent({
          type: "media-delete-failed",
          actorId: actor.id,
          timestamp: new Date().toISOString(),
          assetId: objectKey,
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          details: {
            fromKey: objectKey,
          },
        });

        baseLog("error", "[media.delete] Error", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete media",
        });
      }
    },
  }),

  /**
   * Rename a media file
   *
   * Copies file to new path, then deletes the original.
   * Works with both local filesystem and R2.
   */
  rename: defineAction({
    accept: "json",
    input: z.object({
      oldPath: z.string(),
      newName: z.string(),
    }),
    handler: async ({ oldPath, newName }, context) => {
      const { user: actor, authorship } = await resolveAuthorizedMediaMutation(
        context,
        "media.rename",
        "update",
      );
      const referenceAuthorship = buildAuthorshipSaveContext(
        actor,
        "save-page",
      );
      await assertMediaActionRateLimit({
        context,
        actorId: actor.id,
        action: "rename",
        maxRequests: 60,
        windowMs: 60_000,
      });

      try {
        const adapter = await getAdapter(context);
        const oldKey = assertMediaObjectKey(oldPath);
        const endpointId = inferUploadEndpointId(adapter);

        const result = await renameMediaWithReferenceMigration(
          adapter,
          { locals: context.locals, authorship: referenceAuthorship },
          {
            oldKey,
            newName,
            endpointId,
            catalogAuthorship: authorship,
          },
        );

        emitMediaHistoryEvent({
          type: "media-rename",
          actorId: actor.id,
          timestamp: new Date().toISOString(),
          assetId: oldKey,
          result: { success: true, status: result.status },
          details: {
            fromKey: oldKey,
            toKey: result.newPath,
            filename: assertSafeMediaFilename(newName),
            url: result.url,
          },
        });

        return {
          success: true as const,
          status: result.status,
          oldRetained: result.oldRetained,
          oldPath: result.oldPath,
          newPath: result.newPath,
          url: result.url,
          publicUrl: result.publicUrl,
          references: result.references,
        };
      } catch (error) {
        emitMediaHistoryEvent({
          type: "media-rename-failed",
          actorId: actor.id,
          timestamp: new Date().toISOString(),
          assetId: oldPath,
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          details: {
            fromKey: oldPath,
            filename: newName,
          },
        });

        if (error instanceof MediaLifecycleError) {
          throw new ActionError({
            code: error.code,
            message: error.message,
          });
        }

        if (error instanceof ActionError) throw error;
        baseLog("error", "[media.rename] Error", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to rename media",
        });
      }
    },
  }),

  /**
   * Duplicate a media file
   *
   * Creates a copy of the file with a new name.
   * Works with both local filesystem and R2.
   */
  duplicate: defineAction({
    accept: "json",
    input: z.object({
      path: z.string(),
      newName: z.string().optional(), // If not provided, auto-generates "filename-copy.ext"
    }),
    handler: async ({ path, newName }, context) => {
      const { user: actor, authorship } = await resolveAuthorizedMediaMutation(
        context,
        "media.duplicate",
        "create",
      );
      await assertMediaActionRateLimit({
        context,
        actorId: actor.id,
        action: "duplicate",
        maxRequests: 40,
        windowMs: 60_000,
      });

      try {
        const adapter = await getAdapter(context);
        const sourceKey = assertMediaObjectKey(path);
        const sourceLogicalPath = normalizeLogicalMediaPath(sourceKey);
        const endpointId = inferUploadEndpointId(adapter);

        // Get the original file
        const buffer = await adapter.getMedia(sourceKey);
        if (!buffer) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Media not found: ${sourceKey}`,
          });
        }

        // Generate new filename if not provided
        const filename = sourceKey.split("/").pop() || sourceKey;
        const extIndex = filename.lastIndexOf(".");
        const baseName = extIndex > 0 ? filename.slice(0, extIndex) : filename;
        const ext = extIndex > 0 ? filename.slice(extIndex) : "";

        const duplicateName = assertSafeMediaFilename(
          newName || `${baseName}-copy${ext}`,
        );

        // Determine new path (keep same directory)
        const pathParts = sourceKey.split("/");
        pathParts.pop(); // Remove old filename
        const newPath =
          pathParts.length > 0
            ? `${pathParts.join("/")}/${duplicateName}`
            : duplicateName;
        const newLogicalPath = normalizeLogicalMediaPath(newPath);

        const publicUrl = await adapter.saveMedia(newPath, buffer);

        const checksum = computeSHA256(buffer);
        const timestamp = new Date().toISOString();

        await adapter.registerMediaSourceVersion({
          assetPath: newLogicalPath,
          version: 1,
          objectKey: newPath,
          checksumSha256: checksum,
          mimeType: null,
          sizeBytes: buffer.byteLength,
          width: null,
          height: null,
          createdAt: timestamp,
        });

        await adapter.upsertMediaCatalogAsset(
          {
            logicalPath: newLogicalPath,
            filename: duplicateName,
            extension: getExtension(duplicateName),
            sizeBytes: buffer.byteLength,
            checksumSha256: checksum,
            endpointId,
            publicUrl,
            objectKey: newPath,
            updatedAt: timestamp,
          },
          authorship,
        );

        emitMediaHistoryEvent({
          type: "media-duplicate",
          actorId: actor.id,
          timestamp: new Date().toISOString(),
          assetId: sourceKey,
          result: { success: true },
          details: {
            fromKey: sourceKey,
            toKey: newPath,
            filename: duplicateName,
            url: newLogicalPath,
          },
        });

        return {
          success: true,
          originalPath: sourceKey,
          newPath,
          sourceUrl: sourceLogicalPath,
          url: newLogicalPath,
          publicUrl,
        };
      } catch (error) {
        emitMediaHistoryEvent({
          type: "media-duplicate-failed",
          actorId: actor.id,
          timestamp: new Date().toISOString(),
          assetId: path,
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          details: {
            fromKey: path,
            filename: newName,
          },
        });

        if (error instanceof ActionError) throw error;
        baseLog("error", "[media.duplicate] Error", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to duplicate media",
        });
      }
    },
  }),

  importFromUrl: defineAction({
    accept: "json",
    input: z.object({
      url: z.url(),
      filename: z.string().min(1).optional(),
    }),
    handler: async ({ url, filename }, context) => {
      const { user: actor, authorship } = await resolveAuthorizedMediaMutation(
        context,
        "media.upload",
        "create",
      );

      try {
        const { bytes, response, finalUrl } = await downloadRemoteResource(
          url,
          {
            maxBytes: MEDIA_UPLOAD_MAX_BYTES,
          },
        );
        const buffer = Buffer.from(bytes);
        const contentType = response.headers.get("content-type") || undefined;
        const urlName =
          filename ?? finalUrl.pathname.split("/").pop() ?? "import";
        const safeName = assertSafeMediaFilename(urlName);
        const file = new File([buffer], safeName, {
          type: contentType || "application/octet-stream",
        });
        assertMediaUploadSize(file);

        const adapter = await getAdapter(context);
        const publicUrl = await saveUploadedMediaBuffer(adapter, file, buffer);
        const logicalPath = normalizeLogicalMediaPath(publicUrl);
        const endpointId = inferUploadEndpointId(adapter);
        const extension = getExtension(safeName);
        const checksum = computeSHA256(buffer);
        const timestamp = new Date().toISOString();

        await adapter.registerMediaSourceVersion({
          assetPath: logicalPath,
          version: 1,
          objectKey: logicalPathToObjectKey(logicalPath),
          checksumSha256: checksum,
          mimeType: contentType ?? null,
          sizeBytes: buffer.byteLength,
          width: null,
          height: null,
          createdAt: timestamp,
        });

        await adapter.upsertMediaCatalogAsset(
          {
            logicalPath,
            filename: safeName,
            extension,
            mimeType: contentType,
            sizeBytes: buffer.byteLength,
            checksumSha256: checksum,
            endpointId,
            objectKey: logicalPathToObjectKey(logicalPath),
            publicUrl,
            updatedAt: timestamp,
          },
          authorship,
        );

        emitMediaHistoryEvent({
          type: "media-upload",
          actorId: actor.id,
          timestamp,
          assetId: safeName,
          result: { success: true },
          details: {
            filename: safeName,
            url: logicalPath,
            sizeBytes: buffer.byteLength,
            mimeType: contentType,
            sourceUrl: url,
          },
        });

        return {
          success: true,
          url: logicalPath,
          publicUrl,
          name: safeName,
          size: buffer.byteLength,
          type: getMediaType(contentType, safeName),
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        if (error instanceof RemoteDownloadError) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        baseLog("error", "[media.importFromUrl] Error", {
          url,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to import media from URL",
        });
      }
    },
  }),

  sync: {
    history: defineAction({
      accept: "json",
      input: MediaSyncHistoryInputSchema.optional(),
      handler: async (rawInput, context) => {
        await requireOperation(context, "media.sync.history");
        const startedAt = Date.now();

        try {
          const input = MediaSyncHistoryInputSchema.parse(rawInput ?? {});

          // D1 not available in local dev — return empty history
          let repository: MediaSyncRepository;
          try {
            repository = new MediaSyncRepository(context.locals);
          } catch {
            return { success: true as const, mode: input.mode, jobs: [] };
          }

          const jobs = await repository.listRecentJobsByMode({
            mode: input.mode,
            limit: input.limit,
          });

          const mappedJobs = jobs.map((job) => ({
            id: job.id,
            planJobId: job.planJobId,
            mode: job.mode,
            status: job.status,
            direction: job.direction,
            sourceEndpointId: job.sourceEndpointId,
            targetEndpointId: job.targetEndpointId,
            conflictPolicy: job.conflictPolicy,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
            summary: parseSummary(job.summary),
          }));

          const response = MediaSyncHistoryResponseSchema.parse({
            success: true,
            mode: input.mode,
            lastSync: mappedJobs[0],
            jobs: mappedJobs,
          });

          baseLog("info", "[media.sync.history] Completed", {
            mode: input.mode,
            limit: input.limit,
            jobsReturned: response.jobs.length,
            durationMs: Date.now() - startedAt,
          });

          return response;
        } catch (error) {
          if (error instanceof ActionError) throw error;

          baseLog("error", "[media.sync.history] Error", {
            error: error instanceof Error ? error.message : String(error),
          });

          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch media sync history",
          });
        }
      },
    }),

    /**
     * Plan media sync (dry-run only).
     *
     * Produces create/update/skip/conflict actions without mutating endpoints.
     */
    plan: defineAction({
      accept: "json",
      input: MediaSyncPlanInputSchema,
      handler: async (rawInput, context) => {
        const { user: actor } = await resolveAuthorizedMediaMutation(
          context,
          "media.sync.plan",
          "update",
        );
        const startedAt = Date.now();

        try {
          const input = MediaSyncPlanInputSchema.parse(rawInput);
          const registry = await getEndpointRegistry(context.locals);
          const repository = new MediaSyncRepository(context.locals);
          const availableEndpoints = await registry.list();

          const { sourceEndpointId, targetEndpointId } =
            resolveEndpointPair(input);

          if (!availableEndpoints.includes(sourceEndpointId)) {
            throw new ActionError({
              code: "BAD_REQUEST",
              message: `Source endpoint is unavailable: ${sourceEndpointId}`,
            });
          }

          if (!availableEndpoints.includes(targetEndpointId)) {
            throw new ActionError({
              code: "BAD_REQUEST",
              message: `Target endpoint is unavailable: ${targetEndpointId}`,
            });
          }

          const source = await registry.get(sourceEndpointId);
          const target = await registry.get(targetEndpointId);

          const planner = new MediaSyncPlanner();
          const plan = await planner.plan({
            direction: input.direction,
            source,
            target,
            conflictPolicy: input.conflictPolicy,
            includeDeletes: input.includeDeletes,
          });

          const jobId = crypto.randomUUID();
          const createdAt = new Date().toISOString();

          await repository.createDryRunJob({
            id: jobId,
            plan,
            createdBy: actor.id,
            createdAt,
          });

          baseLog("info", "[media.sync.plan] Completed", {
            actorId: actor.id,
            direction: input.direction,
            sourceEndpointId,
            targetEndpointId,
            conflictPolicy: input.conflictPolicy,
            includeDeletes: input.includeDeletes,
            summary: plan.summary,
            durationMs: Date.now() - startedAt,
          });

          return {
            success: true,
            mode: "dry-run" as const,
            jobId,
            availableEndpoints,
            plan,
          };
        } catch (error) {
          if (error instanceof ActionError) throw error;

          baseLog("error", "[media.sync.plan] Error", {
            error: error instanceof Error ? error.message : String(error),
          });

          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate media sync plan",
          });
        }
      },
    }),

    apply: defineAction({
      accept: "json",
      input: MediaSyncApplyInputSchema,
      handler: async (rawInput, context) => {
        const { user: actor, authorship } =
          await resolveAuthorizedMediaMutation(
            context,
            "media.sync.apply",
            "update",
          );
        await assertMediaActionRateLimit({
          context,
          actorId: actor.id,
          action: "sync-apply",
          maxRequests: 10,
          windowMs: 60_000,
        });
        const startedAt = Date.now();

        try {
          const input = MediaSyncApplyInputSchema.parse(rawInput);
          const repository = new MediaSyncRepository(context.locals);

          const existingApplyJob = await repository.getApplyJobByIdempotencyKey(
            input.idempotencyKey,
          );

          if (existingApplyJob) {
            if (existingApplyJob.planJobId !== input.jobId) {
              throw new ActionError({
                code: "BAD_REQUEST",
                message: "Idempotency key was already used for a different job",
              });
            }

            const summary = parseSummary(existingApplyJob.summary);
            return {
              success: true,
              idempotentReplay: true,
              applyJobId: existingApplyJob.id,
              planJobId: input.jobId,
              status: existingApplyJob.status,
              summary,
            };
          }

          const dryRunJob = await repository.getJobById(input.jobId);
          if (!dryRunJob) {
            throw new ActionError({
              code: "NOT_FOUND",
              message: "Dry-run job not found",
            });
          }

          if (dryRunJob.mode !== "dry-run") {
            throw new ActionError({
              code: "BAD_REQUEST",
              message: "Apply requires a dry-run job",
            });
          }

          const dryRunItems = await repository.listItemsByJobId(dryRunJob.id);
          const plan = MediaSyncRepository.parsePlanFromItems({
            job: dryRunJob,
            items: dryRunItems,
          });

          const registry = await getEndpointRegistry(context.locals);
          assertEndpointId(plan.sourceEndpointId);
          assertEndpointId(plan.targetEndpointId);

          const source = await registry.get(plan.sourceEndpointId);
          const target = await registry.get(plan.targetEndpointId);
          const catalogRepository = getCatalogRepository(context);

          const applyJobId = crypto.randomUUID();
          const createdAt = new Date().toISOString();

          await repository.createApplyJob({
            id: applyJobId,
            planJobId: dryRunJob.id,
            direction: plan.direction,
            sourceEndpointId: plan.sourceEndpointId,
            targetEndpointId: plan.targetEndpointId,
            conflictPolicy: plan.conflictPolicy,
            idempotencyKey: input.idempotencyKey,
            createdBy: actor.id,
            createdAt,
          });

          const executor = new MediaSyncExecutor();
          const applied = await executor.apply({
            plan,
            source,
            target,
            catalog: catalogRepository
              ? {
                  repository: catalogRepository,
                  targetEndpointId: plan.targetEndpointId,
                  authorship,
                }
              : undefined,
          });

          const failedItems = applied.items.filter(
            (item) => item.resultStatus === "failed",
          );

          for (const item of applied.items) {
            await repository.insertApplyItem({
              jobId: applyJobId,
              item,
              createdAt: new Date().toISOString(),
            });
          }

          const status = applied.summary.failed > 0 ? "failed" : "completed";

          await repository.completeApplyJob({
            jobId: applyJobId,
            status,
            summary: applied.summary,
            finishedAt: new Date().toISOString(),
          });

          emitMediaSyncHistoryEvent({
            type:
              status === "completed"
                ? "media-sync-apply"
                : "media-sync-apply-failed",
            actorId: actor.id,
            timestamp: new Date().toISOString(),
            endpointId: plan.targetEndpointId,
            jobId: applyJobId,
            result: applied.summary,
            details: {
              direction: plan.direction,
              sourceEndpointId: plan.sourceEndpointId,
              targetEndpointId: plan.targetEndpointId,
              failureCount: applied.summary.failed,
            },
          });

          baseLog("info", "[media.sync.apply] Completed", {
            actorId: actor.id,
            applyJobId,
            planJobId: dryRunJob.id,
            direction: plan.direction,
            sourceEndpointId: plan.sourceEndpointId,
            targetEndpointId: plan.targetEndpointId,
            status,
            summary: applied.summary,
            failedItemCount: failedItems.length,
            failedItemSamples: failedItems.slice(0, 5).map((item) => ({
              logicalPath: item.logicalPath,
              reason: item.reason,
              errorMessage: item.errorMessage,
            })),
            durationMs: Date.now() - startedAt,
          });

          return {
            success: true,
            idempotentReplay: false,
            applyJobId,
            planJobId: dryRunJob.id,
            status,
            summary: applied.summary,
          };
        } catch (error) {
          if (error instanceof ActionError) throw error;

          baseLog("error", "[media.sync.apply] Error", {
            error: error instanceof Error ? error.message : String(error),
          });

          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to apply media sync job",
          });
        }
      },
    }),
  },
};
