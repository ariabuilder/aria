import {
  isAriaLibraryMediaPath,
  isUrlReferencedMediaPath,
  normalizeLogicalMediaPath,
} from "../media/utils/path";

const BARE_MEDIA_FILENAME_PATTERN = /^[^/\\]+\.[a-z0-9]{2,8}$/i;

export function normalizeDirectCmsMediaReference(ref: string): string | undefined {
  const trimmed = ref.trim();
  if (!trimmed) {
    return undefined;
  }

  if (isUrlReferencedMediaPath(trimmed)) {
    return trimmed;
  }

  if (isAriaLibraryMediaPath(trimmed) || BARE_MEDIA_FILENAME_PATTERN.test(trimmed)) {
    try {
      return normalizeLogicalMediaPath(trimmed);
    } catch {
      return undefined;
    }
  }

  return undefined;
}
