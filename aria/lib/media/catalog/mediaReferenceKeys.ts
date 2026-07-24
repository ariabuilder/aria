import {
  isAriaLibraryMediaPath,
  isUrlReferencedMediaPath,
} from "../utils/path";

const MEDIA_REFERENCE_KEY_VALUES = [
  "src",
  "poster",
  "ogImage",
  "image",
  "thumbnail",
  "url",
] as const;

export type MediaReferenceKey = (typeof MEDIA_REFERENCE_KEY_VALUES)[number];

export const MEDIA_REFERENCE_KEYS: ReadonlySet<string> = new Set(
  MEDIA_REFERENCE_KEY_VALUES,
);

export const MEDIA_FILE_EXTENSIONS =
  /\.(avif|gif|jpe?g|png|svg|webp|mp4|webm|mov|avi|pdf|docx?|pptx?|xlsx?|woff2?|ttf|otf|eot)($|[?#])/i;

export function isLikelyMediaReference(
  value: string,
  parentKey: string | null,
): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (isAriaLibraryMediaPath(trimmed)) {
    return true;
  }

  const hasMediaExtension = MEDIA_FILE_EXTENSIONS.test(trimmed);

  if (parentKey && MEDIA_REFERENCE_KEYS.has(parentKey) && hasMediaExtension) {
    return isUrlReferencedMediaPath(trimmed);
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return Boolean(parentKey && MEDIA_REFERENCE_KEYS.has(parentKey));
  }

  return false;
}
