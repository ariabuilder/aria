import { z } from "zod";
import {
  extractHttpUrlsFromText,
  matchesUnsplashPhotoPath,
} from "../utils/externalMediaUrl";
import {
  isAriaLibraryMediaPath,
  isUrlReferencedMediaPath,
  resolveCollectedLogicalPath,
} from "../utils/path";
import { CollectedMediaReferenceSchema } from "../../schemas/pageMedia";

const MEDIA_REFERENCE_KEYS = new Set([
  "src",
  "poster",
  "ogImage",
  "image",
  "thumbnail",
  "url",
]);

const MEDIA_FILE_EXTENSIONS =
  /\.(avif|gif|jpe?g|png|svg|webp|mp4|webm|mov|avi|pdf|docx?|pptx?|xlsx?)($|[?#])/i;

function isLikelyMediaReference(
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
  const isMediaProp =
    parentKey !== null && MEDIA_REFERENCE_KEYS.has(parentKey);

  if (isMediaProp) {
    if (hasMediaExtension) {
      return isUrlReferencedMediaPath(trimmed);
    }

    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
      return true;
    }

    if (matchesUnsplashPhotoPath(trimmed)) {
      return true;
    }

    if (/\.(unsplash|pexels|cloudinary|imgix)\./i.test(trimmed)) {
      return true;
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return isMediaProp || extractHttpUrlsFromText(trimmed).length > 0;
  }

  if (extractHttpUrlsFromText(trimmed).length > 0) {
    return true;
  }

  return false;
}

function collectReference(
  found: Map<string, z.infer<typeof CollectedMediaReferenceSchema>>,
  rawUrl: string,
  refPath: string,
): void {
  try {
    const logicalPath = resolveCollectedLogicalPath(rawUrl);
    const entry = CollectedMediaReferenceSchema.parse({
      logicalPath,
      rawUrl,
      refPath: refPath || "$root",
    });
    const key = dedupeKey(entry);
    if (!found.has(key)) {
      found.set(key, entry);
    }
  } catch {
    // skip invalid paths
  }
}

function dedupeKey(ref: z.infer<typeof CollectedMediaReferenceSchema>): string {
  return `${ref.rawUrl}\0${ref.logicalPath}`;
}

/**
 * Walk a resource tree and collect media references with both raw and normalized paths.
 */
export function collectMediaReferencesFromResource(
  resource: unknown,
): z.infer<typeof CollectedMediaReferenceSchema>[] {
  const found = new Map<string, z.infer<typeof CollectedMediaReferenceSchema>>();

  const visit = (
    value: unknown,
    refPath: string,
    parentKey: string | null,
  ): void => {
    if (typeof value === "string") {
      if (!isLikelyMediaReference(value, parentKey)) {
        return;
      }

      const trimmed = value.trim();
      const embeddedUrls = extractHttpUrlsFromText(trimmed);

      if (embeddedUrls.length > 1) {
        for (const url of embeddedUrls) {
          collectReference(found, url, refPath);
        }
        return;
      }

      if (embeddedUrls.length === 1) {
        const [extracted] = embeddedUrls;
        const isEmbeddedInLongerString =
          trimmed !== extracted &&
          !matchesUnsplashPhotoPath(trimmed) &&
          !/^https?:\/\//i.test(trimmed) &&
          !isAriaLibraryMediaPath(trimmed);

        if (isEmbeddedInLongerString && extracted) {
          collectReference(found, extracted, refPath);
          return;
        }
      }

      collectReference(found, trimmed, refPath);
      return;
    }

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        visit(value[index], `${refPath}[${index}]`, null);
      }
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const childPath = refPath ? `${refPath}.${key}` : key;
        visit(child, childPath, key);
      }
    }
  };

  visit(resource, "", null);

  return Array.from(found.values());
}
