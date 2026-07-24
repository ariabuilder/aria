import { z } from "zod";
import type { FontAssetFormat, MediaAsset } from "../types/media";
import type { SyncAction } from "../types/media-sync";

export type MediaAssetType =
  | "image"
  | "video"
  | "icon"
  | "document"
  | "archive"
  | "other";

const FontAssetExtensionSchema = z.enum(["woff2", "woff", "ttf", "otf", "eot"]);

const FontAssetMimeTypeSchema = z.enum([
  "font/woff2",
  "font/woff",
  "font/ttf",
  "font/otf",
  "application/font-woff",
  "application/x-font-woff",
  "application/x-font-ttf",
  "application/x-font-opentype",
  "application/vnd.ms-fontobject",
]);

function getFileExtension(value: string): string | null {
  const lastSegment = value.split("?")[0]?.split("#")[0] ?? value;
  const extension = lastSegment.split(".").pop()?.toLowerCase() ?? "";
  return extension.length > 0 ? extension : null;
}

export function getFontAssetFormat(asset: MediaAsset): FontAssetFormat | null {
  const fromName = FontAssetExtensionSchema.safeParse(
    getFileExtension(asset.name),
  );
  if (fromName.success) {
    return fromName.data;
  }

  const fromUrl = FontAssetExtensionSchema.safeParse(
    getFileExtension(asset.url),
  );
  if (fromUrl.success) {
    return fromUrl.data;
  }

  const mimeType = asset.mimeType?.toLowerCase();
  if (mimeType) {
    const fromMime = FontAssetMimeTypeSchema.safeParse(mimeType);
    if (fromMime.success) {
      switch (fromMime.data) {
        case "font/woff2":
          return "woff2";
        case "font/woff":
        case "application/font-woff":
        case "application/x-font-woff":
          return "woff";
        case "font/ttf":
        case "application/x-font-ttf":
          return "ttf";
        case "font/otf":
        case "application/x-font-opentype":
          return "otf";
        case "application/vnd.ms-fontobject":
          return "eot";
      }
    }
  }

  return null;
}

export function isFontAsset(asset: MediaAsset): boolean {
  return getFontAssetFormat(asset) !== null;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function formatUploadedAt(value?: string): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "Unknown";
  }
}

export function formatAssetType(type: MediaAssetType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function getAssetTypeLabel(asset: MediaAsset): string {
  if (isFontAsset(asset)) {
    return "Font";
  }

  return formatAssetType(asset.type);
}

export function formatSyncAction(action: SyncAction): string {
  if (action === "conflict") return "Needs Review";
  if (action === "skip") return "No Change";
  return action.charAt(0).toUpperCase() + action.slice(1);
}

export function getSyncActionIcon(action: SyncAction): string {
  switch (action) {
    case "create":
      return "i-hugeicons:add-circle";
    case "update":
      return "i-hugeicons:refresh";
    case "delete":
      return "i-hugeicons:delete-02";
    case "conflict":
      return "i-hugeicons:alert-01";
    default:
      return "i-hugeicons:checkmark-circle-02";
  }
}

export function inferSyncAssetType(logicalPath: string): MediaAssetType {
  const ext = logicalPath.split(".").pop()?.toLowerCase() ?? "";

  if (["svg", "ico"].includes(ext)) {
    return "icon";
  }

  if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext)) {
    return "image";
  }

  if (["mp4", "webm", "mov", "avi"].includes(ext)) {
    return "video";
  }

  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) {
    return "document";
  }

  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) {
    return "archive";
  }

  return "other";
}

export function getSyncAssetName(logicalPath: string): string {
  return logicalPath.split("/").pop() || logicalPath;
}

export function getAssetIcon(type: string): string {
  switch (type) {
    case "image":
      return "i-hugeicons:album-01";
    case "video":
      return "i-hugeicons:video-01";
    case "icon":
      return "i-hugeicons:sticker";
    case "document":
      return "i-hugeicons:file-01";
    case "archive":
      return "i-hugeicons:archive-01";
    default:
      return "i-hugeicons:file-01";
  }
}

export function splitMediaFileName(filename: string): {
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
