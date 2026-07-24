import type { MediaAsset } from "../types/media";
import { normalizeExternalMediaUrl } from "../../../../../lib/media/utils/externalMediaUrl";

function toAbsoluteUrl(input: string): string {
  try {
    return new URL(input, window.location.origin).href;
  } catch {
    return input;
  }
}

function isSameOriginAssetPath(value?: string): value is string {
  return typeof value === "string" && value.startsWith("/");
}

function isCloudflareEdgeAsset(asset: MediaAsset): boolean {
  return asset.endpointId === "cloudflare-r2";
}

function isAbsoluteHttpUrl(value?: string): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function resolvePreviewCandidates(asset: MediaAsset): string[] {
  const remoteCandidates = [
    asset.thumbnailUrl,
    asset.deliveryUrl,
    asset.url,
    asset.publicUrl,
  ].filter(isAbsoluteHttpUrl);

  const sameOriginCandidates = [
    asset.thumbnailUrl,
    asset.deliveryUrl,
    asset.url,
    asset.publicUrl,
  ].filter(isSameOriginAssetPath);

  // In dev:edge, /uploads is served from the local R2 binding (see serveUploadsFromR2).
  // In production, prefer the CDN/public URL first for cloudflare-r2 assets.
  const ordered = isCloudflareEdgeAsset(asset)
    ? import.meta.env.DEV
      ? [...sameOriginCandidates, ...remoteCandidates]
      : [...remoteCandidates, ...sameOriginCandidates]
    : [...remoteCandidates, ...sameOriginCandidates];

  return Array.from(new Set(ordered));
}

function getFallbackSources(asset: MediaAsset): string[] {
  return resolvePreviewCandidates(asset);
}

export function getAssetSourceUrl(asset: MediaAsset): string {
  return resolvePreviewCandidates(asset)[0] || asset.url;
}

export function getThumbnailUrl(asset: MediaAsset): string {
  const preferRemoteFirst =
    isCloudflareEdgeAsset(asset) && !import.meta.env.DEV;
  const candidates = preferRemoteFirst
    ? [
        asset.publicUrl,
        asset.thumbnailUrl,
        asset.deliveryUrl,
        asset.url,
      ]
    : [asset.thumbnailUrl, asset.deliveryUrl, asset.url, asset.publicUrl];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (isAbsoluteHttpUrl(candidate)) {
      return candidate;
    }

    const normalized = normalizeExternalMediaUrl(candidate);
    if (isAbsoluteHttpUrl(normalized)) {
      return normalized;
    }
  }

  return asset.thumbnailUrl || getAssetSourceUrl(asset);
}

export function isCloudflareOptimized(asset: MediaAsset): boolean {
  return (
    asset.isTransformed === true && asset.transformProvider === "cloudflare"
  );
}

export function handleThumbnailError(event: Event, asset: MediaAsset): void {
  const img = event.target as HTMLImageElement | null;
  if (!img) return;

  const currentSrc = toAbsoluteUrl(img.src);
  const fallbackSources = getFallbackSources(asset);
  const currentIndex = fallbackSources.findIndex(
    (source) => toAbsoluteUrl(source) === currentSrc,
  );
  const nextSource =
    currentIndex >= 0
      ? fallbackSources[currentIndex + 1]
      : fallbackSources.find((source) => toAbsoluteUrl(source) !== currentSrc);

  if (!nextSource) {
    if (currentIndex >= 0 && currentIndex === fallbackSources.length - 1) {
      return;
    }

    img.dataset.previewFallbackAttempted = "true";
    return;
  }

  img.dataset.previewFallbackAttempted =
    nextSource === asset.url ? "true" : "partial";
  img.src = nextSource;
}
