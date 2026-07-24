/**
 * Image Schema
 *
 * Zod validation for image values.
 */

import { z } from "zod";
import {
  isAriaLibraryMediaPath,
  isUrlReferencedMediaPath,
} from "../../../../lib/media/utils/path";
import { POSITION_OPTIONS_3X3 } from "../constants/positionOptions";

/**
 * Object fit options
 */
export const ImageFitSchema = z.enum([
  "cover",
  "contain",
  "fill",
  "none",
  "scale-down",
]);

/**
 * Loading strategy
 */
export const ImageLoadingSchema = z.enum(["lazy", "eager"]);

export const ImageValueSchema = z.object({
  src: z.string().default(""),
  alt: z.string().default(""),
  width: z.string().optional(),
  height: z.string().optional(),
  loading: ImageLoadingSchema.default("lazy"),
  objectFit: ImageFitSchema.optional(),
  objectPosition: z.string().optional(),
});

export type ImageValue = z.infer<typeof ImageValueSchema>;
export type ImageFit = z.infer<typeof ImageFitSchema>;
export type ImageLoading = z.infer<typeof ImageLoadingSchema>;

/**
 * Default image value
 */
export const DEFAULT_IMAGE_OBJECT_FIT: ImageFit = "cover";

export const DEFAULT_IMAGE: ImageValue = {
  src: "",
  alt: "",
  loading: "lazy",
  objectFit: DEFAULT_IMAGE_OBJECT_FIT,
};

/**
 * Object fit labels
 */
export const IMAGE_FIT_LABELS: Record<ImageFit, string> = {
  cover: "Cover",
  contain: "Contain",
  fill: "Fill",
  none: "None",
  "scale-down": "Scale Down",
};

export const IMAGE_LOADING_LABELS: Record<ImageLoading, string> = {
  lazy: "Lazy",
  eager: "Eager",
};

export const OBJECT_POSITION_OPTIONS = [
  ...POSITION_OPTIONS_3X3.map(({ label, value }) => ({ label, value })),
];

/**
 * Check if image source is a data URL
 */
export function isDataUrl(src: string): boolean {
  return src.startsWith("data:");
}

/**
 * Check if image source is external (absolute http(s) URL)
 */
export function isExternalImage(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://");
}

/**
 * Check if image source is a URL/path reference (not Aria library media)
 */
export function isUrlReferencedImage(src: string): boolean {
  return isUrlReferencedMediaPath(src);
}

/**
 * Check if image source is from uploads
 */
export function isUploadedImage(src: string): boolean {
  return isAriaLibraryMediaPath(src);
}

export function inferImageSourceMode(src: string): "media" | "url" {
  const trimmed = src.trim();
  if (!trimmed) {
    return "media";
  }
  if (isDataUrl(trimmed)) {
    return "media";
  }
  if (isUrlReferencedMediaPath(trimmed)) {
    return "url";
  }
  return "media";
}

export function getImageExtension(src: string): string | null {
  const match = src.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
  return match ? match[1].toLowerCase() : null;
}

export function isValidImageExtension(ext: string): boolean {
  const validExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"];
  return validExtensions.includes(ext.toLowerCase());
}
