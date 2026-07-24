/**
 * Video Schema
 *
 * Zod validation for video element properties.
 */

import { z } from "zod";
import { isUrlReferencedMediaPath } from "../../../../lib/media/utils/path";
import { ImageFitSchema } from "./image.schema";

/**
 * Video preload options
 */
export const VideoPreloadSchema = z.enum(["auto", "metadata", "none"]);

export const VIDEO_ASPECT_RATIOS = [
  "16:9",
  "9:16",
  "4:3",
  "1:1",
  "21:9",
  "3:2",
  "4:5",
] as const;

export const VideoAspectRatioSchema = z.enum(VIDEO_ASPECT_RATIOS);

/**
 * Full video value schema
 *
 * Video properties are stored in node.props (not styles).
 * Styles (objectFit, objectPosition) are handled separately.
 */
export const VideoValueSchema = z.object({
  src: z.string().default(""),
  poster: z.string().default(""),
  alt: z.string().default(""),
  autoplay: z.boolean().default(false),
  loop: z.boolean().default(false),
  muted: z.boolean().default(false),
  controls: z.boolean().default(true),
  playsinline: z.boolean().default(false),
  preload: VideoPreloadSchema.default("metadata"),
  objectFit: ImageFitSchema.optional(),
  objectPosition: z.string().optional(),
  aspectRatio: VideoAspectRatioSchema.optional(),
});

export type VideoValue = z.infer<typeof VideoValueSchema>;
export type VideoPreload = z.infer<typeof VideoPreloadSchema>;
export type VideoAspectRatio = z.infer<typeof VideoAspectRatioSchema>;

export const DEFAULT_VIDEO: VideoValue = {
  src: "",
  poster: "",
  alt: "",
  autoplay: false,
  loop: false,
  muted: false,
  controls: true,
  playsinline: false,
  preload: "metadata",
  objectFit: "cover",
  objectPosition: "50% 50%",
  aspectRatio: "16:9",
};

/**
 * Map aspect ratio values to CSS aspect-ratio values
 */
export function getAspectRatioCssValue(
  ratio: VideoAspectRatio | string | undefined,
): string | undefined {
  if (!ratio) return undefined;
  const map: Record<string, string> = {
    "16:9": "16/9",
    "9:16": "9/16",
    "4:3": "4/3",
    "1:1": "1/1",
    "21:9": "21/9",
    "3:2": "3/2",
    "4:5": "4/5",
  };
  return map[ratio] || ratio.replace(":", "/");
}

/**
 * Labels for aspect ratio options
 */
export const VIDEO_ASPECT_RATIO_LABELS: Record<VideoAspectRatio, string> = {
  "16:9": "16:9 Widescreen",
  "9:16": "9:16 Portrait",
  "4:3": "4:3 Standard",
  "1:1": "1:1 Square",
  "21:9": "21:9 Ultrawide",
  "3:2": "3:2 Photo",
  "4:5": "4:5 Portrait",
};

/**
 * Preload option labels
 */
export const VIDEO_PRELOAD_LABELS: Record<VideoPreload, string> = {
  auto: "Auto",
  metadata: "Metadata",
  none: "None",
};

/**
 * Object fit labels (re-exported from image schema for convenience)
 */
export { IMAGE_FIT_LABELS } from "./image.schema";

export function isVideoDataUrl(src: string): boolean {
  return src.startsWith("data:");
}

export function isExternalVideo(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://");
}

/**
 * Check if video source is from uploads
 */
export function isUploadedVideo(src: string): boolean {
  return src.startsWith("/uploads/") || src.includes("/uploads/");
}

/**
 * Check if file is a valid video type
 */
export function isValidVideoExtension(src: string): boolean {
  const ext = getVideoExtension(src);
  if (!ext) return false;
  return ["mp4", "webm", "ogg", "mov", "m4v", "ogv"].includes(
    ext.toLowerCase(),
  );
}

export function getVideoExtension(src: string): string | null {
  const match = src.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
  return match ? match[1].toLowerCase() : null;
}

export function inferVideoSourceMode(src: string): "media" | "url" {
  const trimmed = src.trim();
  if (!trimmed) return "media";
  if (isVideoDataUrl(trimmed)) return "media";
  if (isUrlReferencedMediaPath(trimmed)) return "url";
  return "media";
}
