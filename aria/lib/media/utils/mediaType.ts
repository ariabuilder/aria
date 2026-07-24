import type { MediaAssetType } from "../../schemas/mediaAsset";
import {
  isLikelyExternalImageReference,
  isLikelyExternalVideoReference,
  normalizeExternalMediaUrl,
} from "./externalMediaUrl";

function probePathForExtension(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).pathname.replace(/[?#].*$/, "");
    }
  } catch {
    return trimmed.replace(/[?#].*$/, "");
  }

  return trimmed.replace(/[?#].*$/, "");
}

/**
 * Determine media type from MIME type or filename extension.
 */
export function getMediaTypeFromMimeOrFilename(
  mimeType?: string,
  filename?: string,
): MediaAssetType {
  if (mimeType) {
    if (
      mimeType === "image/svg+xml" ||
      mimeType === "image/x-icon" ||
      mimeType === "image/vnd.microsoft.icon" ||
      mimeType === "image/ico" ||
      mimeType === "image/icon"
    ) {
      return "icon";
    }
    if (mimeType.startsWith("image/")) {
      return "image";
    }
    if (mimeType.startsWith("video/")) {
      return "video";
    }
    if (
      mimeType.includes("pdf") ||
      mimeType.includes("document") ||
      mimeType.includes("msword") ||
      mimeType.includes("spreadsheet")
    ) {
      return "document";
    }
    if (mimeType.includes("zip") || mimeType.includes("archive")) {
      return "archive";
    }
    if (mimeType.startsWith("font/") || mimeType.includes("font")) {
      return "other";
    }
  }

  if (filename) {
    const ext = probePathForExtension(filename).split(".").pop()?.toLowerCase();
    if (ext && ["svg", "ico"].includes(ext)) {
      return "icon";
    }
    if (ext && ["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext)) {
      return "image";
    }
    if (ext && ["mp4", "webm", "mov", "avi"].includes(ext)) {
      return "video";
    }
    if (
      ext &&
      ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)
    ) {
      return "document";
    }
    if (ext && ["zip", "tar", "gz", "rar", "7z"].includes(ext)) {
      return "archive";
    }
    if (
      ext &&
      ["woff2", "woff", "ttf", "otf", "eot"].includes(ext)
    ) {
      return "other";
    }
  }

  return "other";
}

export function inferMediaEndpointId(
  adapterConstructorName: string,
): "cloudflare-r2" | "local-fs" {
  return adapterConstructorName === "CloudflareStorageAdapter"
    ? "cloudflare-r2"
    : "local-fs";
}

export function getFilenameFromLogicalPath(logicalPath: string): string {
  const segments = logicalPath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? logicalPath;
}

export function inferMediaTypeForReference(input: {
  rawUrl: string;
  logicalPath: string;
  refPath: string;
}): MediaAssetType {
  const normalizedRaw = normalizeExternalMediaUrl(input.rawUrl);
  const refPath = input.refPath.split(";")[0]?.trim() ?? input.refPath;
  const inferenceInput = { rawUrl: input.rawUrl, refPath };

  const fromRaw = getMediaTypeFromMimeOrFilename(undefined, normalizedRaw);
  if (fromRaw !== "other") {
    return fromRaw;
  }

  if (isLikelyExternalVideoReference(inferenceInput)) {
    return "video";
  }

  if (isLikelyExternalImageReference(inferenceInput)) {
    return "image";
  }

  return getMediaTypeFromMimeOrFilename(
    undefined,
    getFilenameFromLogicalPath(input.logicalPath),
  );
}

export function isRemoteImagePreviewUrl(url: string): boolean {
  const normalized = normalizeExternalMediaUrl(url);
  const type = getMediaTypeFromMimeOrFilename(undefined, normalized);
  if (type === "image" || type === "icon") {
    return true;
  }

  return isLikelyExternalImageReference({
    rawUrl: normalized,
    refPath: "",
  });
}

export function isRemoteVideoPreviewUrl(url: string): boolean {
  const normalized = normalizeExternalMediaUrl(url);
  const type = getMediaTypeFromMimeOrFilename(undefined, normalized);
  if (type === "video") {
    return true;
  }

  return isLikelyExternalVideoReference({
    rawUrl: normalized,
    refPath: "",
  });
}
