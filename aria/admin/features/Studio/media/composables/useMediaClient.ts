import { actions } from "astro:actions";
import { log } from "@/lib/utils/logger";

import type {
  MediaAsset,
  MediaAssetType,
  UploadMediaResult,
} from "../types/media";
import {
  exceedsMediaTransformInputLimit,
  MEDIA_UPLOAD_MAX_BYTES,
  getMediaTransformInputTooLargeMessage,
  getMediaUploadTooLargeMessage,
} from "../../../../../lib/media/uploadLimits";
import {
  parseMediaListPayload,
  parseUploadMediaPayload,
} from "./mediaActionResults";
import {
  ReplaceMediaSourceResultSchema,
  type ReplaceMediaSourceResult,
} from "../../../../../lib/media/transforms/schemas";

interface LoadMediaAssetsOptions {
  source: string;
  mediaType?: MediaAssetType;
}

interface UploadMediaFileOptions {
  file: File;
  source: string;
}

export class MediaAssetsLoadError extends Error {
  readonly clearCache: boolean;

  constructor(message: string, options: { clearCache?: boolean } = {}) {
    super(message);
    this.name = "MediaAssetsLoadError";
    this.clearCache = options.clearCache === true;
  }
}

export class MediaUploadError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly fileName: string;

  constructor(
    message: string,
    options: { code?: string; status?: number; fileName: string },
  ) {
    super(message);
    this.name = "MediaUploadError";
    this.code = options.code;
    this.status = options.status;
    this.fileName = options.fileName;
  }
}

function shouldClearMediaCache(error: { code?: string }): boolean {
  return error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED";
}

function isContentTooLargeError(error: {
  code?: string;
  status?: number;
}): boolean {
  return error.code === "CONTENT_TOO_LARGE" || error.status === 413;
}

function createUploadError(
  error: { code?: string; status?: number; message?: string },
  file: File,
): MediaUploadError {
  if (isContentTooLargeError(error)) {
    const fallbackMessage = exceedsMediaTransformInputLimit(file)
      ? getMediaTransformInputTooLargeMessage(file.name)
      : getMediaUploadTooLargeMessage(file.name);
    const message =
      error.message && !/request body too large/i.test(error.message)
        ? error.message
        : fallbackMessage;
    return new MediaUploadError(message, {
      code: error.code,
      status: error.status,
      fileName: file.name,
    });
  }

  return new MediaUploadError(error.message || `Upload failed: ${file.name}`, {
    code: error.code,
    status: error.status,
    fileName: file.name,
  });
}

export async function loadMediaAssets(
  options: LoadMediaAssetsOptions,
): Promise<MediaAsset[]> {
  const { data, error } = await actions.media.list({});
  if (error) {
    log("warn", "[Media] Failed to load media list", {
      source: options.source,
      error: error.message,
      mediaType: options.mediaType,
    });
    throw new MediaAssetsLoadError(error.message, {
      clearCache: shouldClearMediaCache(error),
    });
  }

  const parsedAssets = parseMediaListPayload(data, {
    source: options.source,
    mediaType: options.mediaType,
  });

  if (!parsedAssets) {
    throw new MediaAssetsLoadError("Invalid media list payload");
  }

  return parsedAssets;
}

export async function uploadMediaFile(
  options: UploadMediaFileOptions,
): Promise<UploadMediaResult | null> {
  if (options.file.size > MEDIA_UPLOAD_MAX_BYTES) {
    throw new MediaUploadError(
      getMediaUploadTooLargeMessage(options.file.name),
      {
        code: "CONTENT_TOO_LARGE",
        status: 413,
        fileName: options.file.name,
      },
    );
  }

  if (exceedsMediaTransformInputLimit(options.file)) {
    throw new MediaUploadError(
      getMediaTransformInputTooLargeMessage(options.file.name),
      {
        code: "CONTENT_TOO_LARGE",
        status: 413,
        fileName: options.file.name,
      },
    );
  }

  const formData = new FormData();
  formData.append("file", options.file);

  const { data, error } = await actions.media.upload(formData);
  if (error) {
    log("warn", "[Media] Upload failed", {
      source: options.source,
      error: error.message,
      code: error.code,
      status: error.status,
      fileName: options.file.name,
    });
    throw createUploadError(error, options.file);
  }

  return parseUploadMediaPayload(data, {
    source: options.source,
    fileName: options.file.name,
  });
}

export async function replaceMediaSourceFile(options: {
  assetPath: string;
  file: File;
  expectedUpdatedAt?: string | null;
}): Promise<ReplaceMediaSourceResult> {
  if (options.file.size > MEDIA_UPLOAD_MAX_BYTES) {
    throw createUploadError(
      { code: "CONTENT_TOO_LARGE", status: 413 },
      options.file,
    );
  }
  if (exceedsMediaTransformInputLimit(options.file)) {
    throw createUploadError(
      { code: "CONTENT_TOO_LARGE", status: 413 },
      options.file,
    );
  }

  const formData = new FormData();
  formData.append("assetPath", options.assetPath);
  formData.append("file", options.file);
  if (options.expectedUpdatedAt) {
    formData.append("expectedUpdatedAt", options.expectedUpdatedAt);
  }
  const { data, error } = await actions.media.replaceSource(formData);
  if (error) throw createUploadError(error, options.file);
  return ReplaceMediaSourceResultSchema.parse(data);
}
