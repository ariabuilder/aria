import type { StorageAdapter } from "../../storage/adapter";
import type { PageDSL } from "../../types/nodes";
import { MediaCatalogRepository } from "./repository";
import { collectPageMediaReferences } from "./collectPageMediaReferences";
import {
  GetPageMediaOutputSchema,
  type CollectedMediaReference,
  type GetPageMediaOutput,
  type PageMediaExternalAsset,
  type PageMediaLibraryAsset,
  type PageMediaMissingAsset,
} from "../../schemas/pageMedia";
import type { MediaAssetType } from "../../schemas/mediaAsset";
import {
  displayNameForExternalUrl,
  normalizeExternalMediaUrl,
} from "../utils/externalMediaUrl";
import {
  getFilenameFromLogicalPath,
  getMediaTypeFromMimeOrFilename,
  inferMediaEndpointId,
  inferMediaTypeForReference,
} from "../utils/mediaType";
import {
  isUrlReferencedMediaPath,
  normalizeLogicalMediaPath,
} from "../utils/path";
import { isListableMediaPath } from "../utils/visibility";

import type { MediaAssetCatalogListRow } from "./repository";

type CatalogAssetRow = MediaAssetCatalogListRow;

type LocalMediaFile = {
  path: string;
  url: string;
  size: number;
  contentType?: string;
  createdAt: string;
};

function isExternalRawUrl(rawUrl: string): boolean {
  return isUrlReferencedMediaPath(rawUrl);
}

async function queryCatalogAssetsByLogicalPaths(
  catalog: Pick<MediaCatalogRepository, "listAssetsByLogicalPaths">,
  logicalPaths: readonly string[],
): Promise<Map<string, CatalogAssetRow>> {
  const map = new Map<string, CatalogAssetRow>();
  const rows = await catalog.listAssetsByLogicalPaths(logicalPaths);

  for (const row of rows) {
    const normalized = normalizeLogicalMediaPath(row.logical_path);
    map.set(normalized, row);
  }

  return map;
}

function catalogRowToLibraryAsset(
  row: CatalogAssetRow,
  refPaths: string[],
  endpointId: "cloudflare-r2" | "local-fs",
): PageMediaLibraryAsset {
  const logicalPath = normalizeLogicalMediaPath(row.logical_path);
  const mediaType = getMediaTypeFromMimeOrFilename(
    row.mime_type ?? undefined,
    row.filename,
  );

  const dimensions =
    row.width != null && row.height != null && row.width > 0 && row.height > 0
      ? { width: row.width, height: row.height }
      : undefined;

  const publicUrl = row.public_url ?? undefined;

  return {
    id: row.id,
    name: row.filename,
    type: mediaType,
    url: logicalPath,
    publicUrl,
    deliveryUrl: publicUrl ?? logicalPath,
    thumbnailUrl: publicUrl ?? logicalPath,
    endpointId,
    size: row.size_bytes,
    dimensions,
    mimeType: row.mime_type ?? undefined,
    uploadedAt: row.updated_at,
    source: "library",
    refPaths: refPaths.length > 0 ? refPaths : undefined,
  };
}

function localFileToLibraryAsset(
  file: LocalMediaFile,
  logicalPath: string,
  refPaths: string[],
  endpointId: "cloudflare-r2" | "local-fs",
): PageMediaLibraryAsset {
  const name = getFilenameFromLogicalPath(logicalPath);
  const mediaType = getMediaTypeFromMimeOrFilename(file.contentType, name);

  return {
    id: logicalPath,
    name,
    type: mediaType,
    url: logicalPath,
    deliveryUrl: file.url,
    thumbnailUrl: file.url,
    endpointId,
    size: file.size,
    mimeType: file.contentType,
    uploadedAt: file.createdAt,
    source: "library",
    refPaths: refPaths.length > 0 ? refPaths : undefined,
  };
}

function buildExternalAsset(
  ref: CollectedMediaReference,
  mediaType: MediaAssetType,
): PageMediaExternalAsset {
  const resolvedUrl = normalizeExternalMediaUrl(ref.rawUrl);
  const name = displayNameForExternalUrl(resolvedUrl);

  return {
    id: resolvedUrl,
    name,
    type: mediaType,
    url: resolvedUrl,
    publicUrl: resolvedUrl,
    deliveryUrl: resolvedUrl,
    thumbnailUrl: resolvedUrl,
    size: 0,
    source: "external",
    rawUrl: resolvedUrl,
    refPath: ref.refPath,
  };
}

function buildMissingAsset(
  ref: CollectedMediaReference,
  mediaType: MediaAssetType,
): PageMediaMissingAsset {
  const name = getFilenameFromLogicalPath(ref.logicalPath);

  return {
    id: ref.logicalPath,
    name,
    type: mediaType,
    url: ref.logicalPath,
    deliveryUrl: ref.logicalPath,
    thumbnailUrl: ref.logicalPath,
    size: 0,
    source: "missing",
    logicalPath: ref.logicalPath,
    refPath: ref.refPath,
  };
}

function buildLocalMediaMap(
  files: LocalMediaFile[],
): Map<string, LocalMediaFile> {
  const map = new Map<string, LocalMediaFile>();

  for (const file of files) {
    if (!isListableMediaPath(file.path)) {
      continue;
    }

    try {
      const logicalPath = normalizeLogicalMediaPath(
        file.url.startsWith("/") ? file.url : `/uploads/${file.path}`,
      );
      map.set(logicalPath, file);
    } catch {
      continue;
    }
  }

  return map;
}

export async function resolvePageMediaAssets(
  page: PageDSL,
  adapter: StorageAdapter,
  catalog: MediaCatalogRepository | null,
): Promise<GetPageMediaOutput> {
  const endpointId = inferMediaEndpointId(adapter.constructor.name);

  const { references, missingComponents, truncated } =
    await collectPageMediaReferences(page, (id) => adapter.getComponentDSL(id));

  const refPathsByLogical = new Map<string, string[]>();
  const libraryCandidates: CollectedMediaReference[] = [];

  for (const ref of references) {
    const paths = refPathsByLogical.get(ref.logicalPath) ?? [];
    paths.push(ref.refPath);
    refPathsByLogical.set(ref.logicalPath, paths);

    if (!isExternalRawUrl(ref.rawUrl)) {
      libraryCandidates.push(ref);
    }
  }

  const uniqueLibraryPaths = [
    ...new Set(libraryCandidates.map((ref) => ref.logicalPath)),
  ];

  const catalogReader =
    catalog ??
    (typeof adapter.listMediaCatalogAssetsByLogicalPaths === "function"
      ? ({
          listAssetsByLogicalPaths: (paths: readonly string[]) =>
            adapter.listMediaCatalogAssetsByLogicalPaths(paths),
        } as Pick<MediaCatalogRepository, "listAssetsByLogicalPaths">)
      : null);
  const catalogByPath = catalogReader
    ? await queryCatalogAssetsByLogicalPaths(catalogReader, uniqueLibraryPaths)
    : new Map<string, CatalogAssetRow>();

  let localByPath = new Map<string, LocalMediaFile>();
  if (catalogByPath.size < uniqueLibraryPaths.length) {
    const allFiles = await adapter.listMedia();
    localByPath = buildLocalMediaMap(allFiles);
  }

  const assets: PageMediaLibraryAsset[] = [];
  const external: PageMediaExternalAsset[] = [];
  const missing: PageMediaMissingAsset[] = [];
  const resolvedLibraryPaths = new Set<string>();
  const resolvedExternalUrls = new Set<string>();
  const resolvedMissingPaths = new Set<string>();

  for (const ref of references) {
    const mediaType = inferMediaTypeForReference({
      rawUrl: ref.rawUrl,
      logicalPath: ref.logicalPath,
      refPath: ref.refPath,
    });

    if (isExternalRawUrl(ref.rawUrl)) {
      const catalogRow = catalogByPath.get(ref.logicalPath);
      const localFile = localByPath.get(ref.logicalPath);

      if (
        catalogRow &&
        catalogRow.status === "active" &&
        !resolvedLibraryPaths.has(ref.logicalPath)
      ) {
        resolvedLibraryPaths.add(ref.logicalPath);
        assets.push(
          catalogRowToLibraryAsset(
            catalogRow,
            refPathsByLogical.get(ref.logicalPath) ?? [ref.refPath],
            endpointId,
          ),
        );
        continue;
      }

      if (localFile && !resolvedLibraryPaths.has(ref.logicalPath)) {
        resolvedLibraryPaths.add(ref.logicalPath);
        assets.push(
          localFileToLibraryAsset(
            localFile,
            ref.logicalPath,
            refPathsByLogical.get(ref.logicalPath) ?? [ref.refPath],
            endpointId,
          ),
        );
        continue;
      }

      const externalKey = normalizeExternalMediaUrl(ref.rawUrl);
      if (!resolvedExternalUrls.has(externalKey)) {
        resolvedExternalUrls.add(externalKey);
        external.push(buildExternalAsset(ref, mediaType));
      }
      continue;
    }

    if (resolvedLibraryPaths.has(ref.logicalPath)) {
      continue;
    }

    const catalogRow = catalogByPath.get(ref.logicalPath);
    if (catalogRow) {
      resolvedLibraryPaths.add(ref.logicalPath);
      if (catalogRow.status === "active") {
        assets.push(
          catalogRowToLibraryAsset(
            catalogRow,
            refPathsByLogical.get(ref.logicalPath) ?? [ref.refPath],
            endpointId,
          ),
        );
      } else if (!resolvedMissingPaths.has(ref.logicalPath)) {
        resolvedMissingPaths.add(ref.logicalPath);
        missing.push(buildMissingAsset(ref, mediaType));
      }
      continue;
    }

    const localFile = localByPath.get(ref.logicalPath);
    if (localFile) {
      resolvedLibraryPaths.add(ref.logicalPath);
      assets.push(
        localFileToLibraryAsset(
          localFile,
          ref.logicalPath,
          refPathsByLogical.get(ref.logicalPath) ?? [ref.refPath],
          endpointId,
        ),
      );
      continue;
    }

    if (!resolvedMissingPaths.has(ref.logicalPath)) {
      resolvedMissingPaths.add(ref.logicalPath);
      missing.push(buildMissingAsset(ref, mediaType));
    }
  }

  return GetPageMediaOutputSchema.parse({
    assets,
    external,
    missing,
    missingComponents,
    truncated: truncated ? true : undefined,
  });
}
