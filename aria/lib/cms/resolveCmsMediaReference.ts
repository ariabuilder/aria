import type { MediaAssetCatalogListRow } from "../media/catalog/repository";
import type { MediaCatalogRepository } from "../media/catalog/repository";
import {
  isAriaLibraryMediaPath,
  normalizeLogicalMediaPath,
} from "../media/utils/path";
import { getFilenameFromLogicalPath } from "../media/utils/mediaType";
import { isListableMediaPath } from "../media/utils/visibility";
import type { StorageAdapter } from "../storage/adapter";
import { normalizeDirectCmsMediaReference } from "./directMediaReference";
import { parseCmsImageFieldValue } from "./styleBindings";

const BARE_MEDIA_FILENAME_PATTERN = /^[^/\\]+\.[a-z0-9]{2,8}$/i;

function catalogRowDeliveryUrl(row: MediaAssetCatalogListRow): string {
  const publicUrl = row.public_url?.trim();
  if (publicUrl) {
    return publicUrl;
  }

  try {
    return normalizeLogicalMediaPath(row.logical_path);
  } catch {
    return row.logical_path.trim();
  }
}

function indexCatalogRow(
  urlByReference: Map<string, string>,
  row: MediaAssetCatalogListRow,
): void {
  const url = catalogRowDeliveryUrl(row);
  if (!url) {
    return;
  }

  urlByReference.set(row.id, url);
  urlByReference.set(row.logical_path, url);

  try {
    urlByReference.set(normalizeLogicalMediaPath(row.logical_path), url);
  } catch {
    // Keep the raw logical path mapping when normalization fails.
  }

  if (row.filename.trim()) {
    urlByReference.set(row.filename, url);
  }
}

function unresolvedReferences(
  references: readonly string[],
  urlByReference: Map<string, string>,
): string[] {
  return references.filter((reference) => {
    if (urlByReference.has(reference)) {
      return false;
    }
    return !normalizeDirectCmsMediaReference(reference);
  });
}

function logicalPathCandidates(references: readonly string[]): string[] {
  const paths = new Set<string>();

  for (const reference of references) {
    if (isAriaLibraryMediaPath(reference) || reference.startsWith("/")) {
      try {
        paths.add(normalizeLogicalMediaPath(reference));
      } catch {
        continue;
      }
      continue;
    }

    if (BARE_MEDIA_FILENAME_PATTERN.test(reference)) {
      try {
        paths.add(normalizeLogicalMediaPath(reference));
      } catch {
        continue;
      }
    }
  }

  return [...paths];
}

async function indexAdapterMediaFallback(
  urlByReference: Map<string, string>,
  adapter: StorageAdapter,
  references: readonly string[],
): Promise<void> {
  if (references.length === 0) {
    return;
  }

  const files = await adapter.listMedia();
  const unresolved = new Set(references);

  for (const file of files) {
    if (!isListableMediaPath(file.path)) {
      continue;
    }

    const deliveryUrl = file.url?.trim();
    if (!deliveryUrl) {
      continue;
    }

    let logicalPath = "";
    try {
      logicalPath = normalizeLogicalMediaPath(
        file.url.startsWith("/") ? file.url : `/uploads/${file.path}`,
      );
    } catch {
      continue;
    }

    const filename = getFilenameFromLogicalPath(logicalPath);
    const keys = new Set<string>([logicalPath, filename, file.path, file.url]);

    for (const key of keys) {
      if (!key || !unresolved.has(key)) {
        continue;
      }
      urlByReference.set(key, deliveryUrl);
    }
  }
}

export async function buildCmsMediaReferenceUrlMap(input: {
  references: readonly string[];
  catalog: MediaCatalogRepository | null | undefined;
  adapter: StorageAdapter;
}): Promise<Map<string, string>> {
  const urlByReference = new Map<string, string>();

  for (const reference of input.references) {
    const direct = normalizeDirectCmsMediaReference(reference);
    if (direct) {
      urlByReference.set(reference, direct);
    }
  }

  let pending = unresolvedReferences(input.references, urlByReference);

  const catalog =
    input.catalog ??
    (typeof input.adapter.listMediaCatalogAssetsByIds === "function" &&
    typeof input.adapter.listMediaCatalogAssetsByLogicalPaths === "function"
      ? {
          listAssetsByIds: (ids: readonly string[]) =>
            input.adapter.listMediaCatalogAssetsByIds(ids),
          listAssetsByLogicalPaths: (paths: readonly string[]) =>
            input.adapter.listMediaCatalogAssetsByLogicalPaths(paths),
        }
      : null);

  if (catalog && pending.length > 0) {
    const rowsById = await catalog.listAssetsByIds(pending);
    for (const row of rowsById) {
      indexCatalogRow(urlByReference, row);
    }

    pending = unresolvedReferences(input.references, urlByReference);
    const logicalPaths = logicalPathCandidates(pending);
    if (logicalPaths.length > 0) {
      const rowsByPath = await catalog.listAssetsByLogicalPaths(logicalPaths);
      for (const row of rowsByPath) {
        indexCatalogRow(urlByReference, row);
      }
    }
  }

  pending = unresolvedReferences(input.references, urlByReference);
  if (pending.length > 0) {
    await indexAdapterMediaFallback(urlByReference, input.adapter, pending);
  }

  return urlByReference;
}

export function collectCmsMediaReferences(value: unknown): string[] {
  const references: string[] = [];

  if (typeof value === "string" && value.trim()) {
    references.push(value.trim());
    return references;
  }

  const parsed = parseCmsImageFieldValue(value);
  if (parsed?.mediaId?.trim()) {
    references.push(parsed.mediaId.trim());
  }

  return references;
}

function resolveDirectCmsMediaReferenceValue(
  value: unknown,
): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return normalizeDirectCmsMediaReference(value.trim());
  }

  const parsed = parseCmsImageFieldValue(value);
  if (!parsed) {
    return undefined;
  }

  if (parsed.url?.trim()) {
    return normalizeDirectCmsMediaReference(parsed.url) ?? parsed.url.trim();
  }

  if (parsed.mediaId?.trim()) {
    return normalizeDirectCmsMediaReference(parsed.mediaId);
  }

  return undefined;
}

export function resolveCmsMediaReferenceValue(
  value: unknown,
  urlByReference: Map<string, string>,
): string {
  const directUrl = resolveDirectCmsMediaReferenceValue(value);
  if (directUrl) {
    return directUrl;
  }

  const parsed = parseCmsImageFieldValue(value);
  if (parsed?.mediaId?.trim()) {
    const mediaId = parsed.mediaId.trim();
    return urlByReference.get(mediaId)?.trim() || "";
  }

  if (typeof value === "string" && value.trim()) {
    return urlByReference.get(value.trim())?.trim() || "";
  }

  return "";
}
