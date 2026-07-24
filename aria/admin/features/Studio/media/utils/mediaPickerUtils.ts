import {
  MediaAssetSchema,
  type MediaAsset,
  type MediaAssetType,
  type UploadMediaResult,
} from "../composables/mediaActionResults";
import { getMediaTypeFromMimeOrFilename } from "../../../../../lib/media/utils/mediaType";

const BROAD_UPLOAD_ACCEPT =
  "image/*,video/*,.pdf,.doc,.docx,.svg,.woff,.woff2,.ttf,.otf,.eot";

const SVG_MIME_TYPE = "image/svg+xml";
const SVG_FILE_EXTENSION_RE = /\.svg($|[?#])/i;

export type MediaTypeFilter =
  | MediaAssetType
  | readonly MediaAssetType[]
  | undefined;

function normalizeMediaTypeFilter(filter: MediaTypeFilter): MediaAssetType[] {
  if (!filter) return [];
  return typeof filter === "string" ? [filter] : [...filter];
}

export function isSvgMediaAsset(asset: MediaAsset): boolean {
  if (asset.mimeType === SVG_MIME_TYPE) {
    return true;
  }

  return [
    asset.name,
    asset.publicUrl,
    asset.url,
    asset.deliveryUrl,
    asset.thumbnailUrl,
  ].some(
    (value) => typeof value === "string" && SVG_FILE_EXTENSION_RE.test(value),
  );
}

export function resolveMediaAssetUrl(asset: MediaAsset): string {
  return asset.deliveryUrl || asset.publicUrl || asset.url || "";
}

export function getUploadAcceptForMediaType(
  mediaType: MediaTypeFilter,
): string {
  const mediaTypes = normalizeMediaTypeFilter(mediaType);
  if (mediaTypes.length === 0) return BROAD_UPLOAD_ACCEPT;

  const acceptValues = mediaTypes.map((type) => {
    switch (type) {
      case "image":
        return "image/*";
      case "icon":
        return "image/svg+xml,.svg,.ico";
      case "video":
        return "video/*";
      case "document":
        return ".pdf,.doc,.docx,.txt,.md,.csv,.json,.xml";
      case "archive":
        return ".zip,.tar,.gz,.rar,.7z";
      case "other":
        return BROAD_UPLOAD_ACCEPT;
    }
  });

  return [...new Set(acceptValues.join(",").split(","))].join(",");
}

export function assetMatchesMediaTypeFilter(
  asset: MediaAsset,
  mediaType: MediaTypeFilter,
): boolean {
  const mediaTypes = normalizeMediaTypeFilter(mediaType);
  if (mediaTypes.length === 0) return true;

  const inferredType = getMediaTypeFromMimeOrFilename(
    asset.mimeType,
    asset.name || asset.url,
  );

  return mediaTypes.some(
    (type) => asset.type === type || inferredType === type,
  );
}

export function findUploadedAssetInList(
  assets: MediaAsset[],
  upload: UploadMediaResult,
): MediaAsset | null {
  const candidate =
    assets.find(
      (asset) => asset.url === upload.url || asset.name === upload.name,
    ) ?? null;

  if (!candidate) return null;

  const parsed = MediaAssetSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
