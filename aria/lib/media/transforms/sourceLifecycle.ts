import type { StorageAdapter } from "../../storage/adapter";
import type { EndpointId } from "../endpoints/registry";
import type { MediaAssetAuthorshipContext } from "../catalog/authorshipSchemas";
import { computeSHA256 } from "../utils/checksum";
import {
  logicalPathToObjectKey,
  normalizeLogicalMediaPath,
} from "../utils/path";
import {
  ReplaceMediaSourceResultSchema,
  type MediaSourceVersion,
  type ReplaceMediaSourceResult,
} from "./schemas";
import {
  buildMediaSourceVersionObjectKey,
  inspectImageSource,
} from "./sourceInspection";
import { MediaTransformConflictError } from "./storage";

export type ReplaceMediaSourceInput = {
  assetPath: string;
  source: Buffer;
  contentType?: string;
  endpointId: EndpointId;
  expectedUpdatedAt?: string | null;
  catalogAuthorship?: MediaAssetAuthorshipContext;
};

function filenameFromPath(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function extensionFromFilename(filename: string): string | undefined {
  const index = filename.lastIndexOf(".");
  return index > 0 && index < filename.length - 1
    ? filename.slice(index + 1).toLowerCase()
    : undefined;
}

async function updateReplacementCatalog(input: {
  adapter: StorageAdapter;
  assetPath: string;
  canonicalKey: string;
  source: Buffer;
  checksum: string;
  mimeType: string;
  endpointId: EndpointId;
  updatedAt: string;
  catalogAuthorship?: MediaAssetAuthorshipContext;
}): Promise<string[]> {
  const filename = filenameFromPath(input.assetPath);
  try {
    await input.adapter.upsertMediaCatalogAsset(
      {
        logicalPath: input.assetPath,
        filename,
        extension: extensionFromFilename(filename),
        mimeType: input.mimeType,
        sizeBytes: input.source.byteLength,
        checksumSha256: input.checksum,
        endpointId: input.endpointId,
        objectKey: input.canonicalKey,
        publicUrl: input.assetPath,
        updatedAt: input.updatedAt,
      },
      input.catalogAuthorship,
    );
    return [];
  } catch (error) {
    return [
      `Catalog update failed: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
}

async function ensureObject(
  adapter: StorageAdapter,
  objectKey: string,
  source: Buffer,
  contentType: string,
): Promise<void> {
  const existing = await adapter.getMedia(objectKey);
  if (existing) {
    if (computeSHA256(existing) !== computeSHA256(source)) {
      throw new MediaTransformConflictError(
        "An immutable source object exists with different bytes.",
      );
    }
    return;
  }
  await adapter.saveMedia(objectKey, source, { contentType });
}

async function preserveCurrentSource(input: {
  adapter: StorageAdapter;
  assetPath: string;
  canonicalKey: string;
  currentVersion: number;
  currentRecord: MediaSourceVersion | undefined;
  currentBytes: Buffer;
}): Promise<MediaSourceVersion> {
  const inspection = inspectImageSource(input.currentBytes);
  const checksum = computeSHA256(input.currentBytes);
  const immutableKey = buildMediaSourceVersionObjectKey({
    assetPath: input.assetPath,
    version: input.currentVersion,
    checksumSha256: checksum,
    mimeType: inspection.mimeType,
  });
  await ensureObject(
    input.adapter,
    immutableKey,
    input.currentBytes,
    inspection.mimeType,
  );

  if (!input.currentRecord) {
    return input.adapter.registerMediaSourceVersion({
      assetPath: input.assetPath,
      version: input.currentVersion,
      objectKey: immutableKey,
      checksumSha256: checksum,
      mimeType: inspection.mimeType,
      sizeBytes: input.currentBytes.byteLength,
      width: inspection.width,
      height: inspection.height,
      createdAt: new Date().toISOString(),
    });
  }

  if (input.currentRecord.objectKey === immutableKey)
    return input.currentRecord;
  return input.adapter.relocateMediaSourceVersionObject({
    assetPath: input.assetPath,
    version: input.currentVersion,
    expectedObjectKey: input.currentRecord.objectKey,
    objectKey: immutableKey,
    checksumSha256: checksum,
    mimeType: inspection.mimeType,
    sizeBytes: input.currentBytes.byteLength,
    width: inspection.width,
    height: inspection.height,
  });
}

export async function replaceMediaSource(
  adapter: StorageAdapter,
  input: ReplaceMediaSourceInput,
): Promise<ReplaceMediaSourceResult> {
  const assetPath = normalizeLogicalMediaPath(input.assetPath);
  const canonicalKey = logicalPathToObjectKey(assetPath);
  const state = await adapter.getMediaTransformState(assetPath);
  const previousSourceVersion = state.profile?.currentSourceVersion ?? 1;
  if (
    input.expectedUpdatedAt !== undefined &&
    (state.profile?.updatedAt ?? null) !== input.expectedUpdatedAt
  ) {
    throw new MediaTransformConflictError(
      "This asset was updated in another session. Reload before replacing.",
    );
  }

  const currentRecord = state.sourceVersions.find(
    (source) => source.version === previousSourceVersion,
  );
  const [currentBytes, canonicalBytes] = await Promise.all([
    adapter.getMedia(currentRecord?.objectKey ?? canonicalKey),
    adapter.getMedia(canonicalKey),
  ]);
  if (!currentBytes) {
    throw new MediaTransformConflictError(
      "The current source image is unavailable, so replacement was stopped.",
    );
  }

  const [currentInspection, nextInspection] = [
    inspectImageSource(currentBytes),
    inspectImageSource(input.source),
  ];
  if (currentInspection.mimeType !== nextInspection.mimeType) {
    throw new MediaTransformConflictError(
      `Replacement must keep the ${currentInspection.mimeType} format. Rename the asset before changing formats.`,
    );
  }
  const currentChecksum = computeSHA256(currentBytes);
  const nextChecksum = computeSHA256(input.source);
  if (currentChecksum === nextChecksum) {
    if (canonicalBytes && computeSHA256(canonicalBytes) === nextChecksum) {
      throw new MediaTransformConflictError(
        "The selected file is identical to the current source image.",
      );
    }
    try {
      await adapter.saveMedia(canonicalKey, input.source, {
        contentType: nextInspection.mimeType,
      });
    } catch (error) {
      return ReplaceMediaSourceResultSchema.parse({
        success: true,
        status: "incomplete",
        promoted: true,
        previousSourceVersion,
        currentSourceVersion: previousSourceVersion,
        oldSourceRetained: true,
        stagedSourceRetained: true,
        canonicalUpdated: false,
        variants: {
          preserved: state.variants.length,
          needsRebase: state.variants.filter(
            (variant) => variant.sourceVersion !== previousSourceVersion,
          ).length,
        },
        profile: state.profile,
        source: currentRecord ?? null,
        warnings: [
          `Public source projection failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
      });
    }
    const warnings = await updateReplacementCatalog({
      adapter,
      assetPath,
      canonicalKey,
      source: input.source,
      checksum: nextChecksum,
      mimeType: nextInspection.mimeType,
      endpointId: input.endpointId,
      updatedAt: state.profile?.updatedAt ?? new Date().toISOString(),
      catalogAuthorship: input.catalogAuthorship,
    });
    return ReplaceMediaSourceResultSchema.parse({
      success: true,
      status: warnings.length === 0 ? "completed" : "incomplete",
      promoted: true,
      previousSourceVersion,
      currentSourceVersion: previousSourceVersion,
      oldSourceRetained: true,
      stagedSourceRetained: true,
      canonicalUpdated: true,
      variants: {
        preserved: state.variants.length,
        needsRebase: state.variants.filter(
          (variant) => variant.sourceVersion !== previousSourceVersion,
        ).length,
      },
      profile: state.profile,
      source: currentRecord ?? null,
      warnings,
    });
  }

  const preserved = await preserveCurrentSource({
    adapter,
    assetPath,
    canonicalKey,
    currentVersion: previousSourceVersion,
    currentRecord,
    currentBytes,
  });

  let nextSource = state.sourceVersions.find(
    (source) =>
      source.version > previousSourceVersion &&
      source.checksumSha256 === nextChecksum,
  );
  if (!nextSource) {
    const nextSourceVersion =
      Math.max(
        previousSourceVersion,
        ...state.sourceVersions.map((source) => source.version),
      ) + 1;
    const nextObjectKey = buildMediaSourceVersionObjectKey({
      assetPath,
      version: nextSourceVersion,
      checksumSha256: nextChecksum,
      mimeType: nextInspection.mimeType,
    });
    await ensureObject(
      adapter,
      nextObjectKey,
      input.source,
      nextInspection.mimeType,
    );
    nextSource = await adapter.registerMediaSourceVersion({
      assetPath,
      version: nextSourceVersion,
      objectKey: nextObjectKey,
      checksumSha256: nextChecksum,
      mimeType: nextInspection.mimeType,
      sizeBytes: input.source.byteLength,
      width: nextInspection.width,
      height: nextInspection.height,
      createdAt: new Date().toISOString(),
    });
  } else {
    await ensureObject(
      adapter,
      nextSource.objectKey,
      input.source,
      nextInspection.mimeType,
    );
  }

  const profile = await adapter.promoteMediaSourceVersion({
    assetPath,
    previousSourceVersion,
    nextSourceVersion: nextSource.version,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });

  try {
    await adapter.saveMedia(canonicalKey, input.source, {
      contentType: nextInspection.mimeType,
    });
  } catch (error) {
    return ReplaceMediaSourceResultSchema.parse({
      success: true,
      status: "incomplete",
      promoted: true,
      previousSourceVersion,
      currentSourceVersion: nextSource.version,
      oldSourceRetained: Boolean(preserved),
      stagedSourceRetained: true,
      canonicalUpdated: false,
      variants: {
        preserved: state.variants.length,
        needsRebase: state.variants.filter(
          (variant) => variant.sourceVersion !== nextSource.version,
        ).length,
      },
      profile,
      source: nextSource,
      warnings: [
        `Public source projection failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    });
  }

  const warnings = await updateReplacementCatalog({
    adapter,
    assetPath,
    canonicalKey,
    source: input.source,
    checksum: nextChecksum,
    mimeType: nextInspection.mimeType,
    endpointId: input.endpointId,
    updatedAt: profile.updatedAt,
    catalogAuthorship: input.catalogAuthorship,
  });

  return ReplaceMediaSourceResultSchema.parse({
    success: true,
    status: warnings.length === 0 ? "completed" : "incomplete",
    promoted: true,
    previousSourceVersion,
    currentSourceVersion: nextSource.version,
    oldSourceRetained: true,
    stagedSourceRetained: true,
    canonicalUpdated: true,
    variants: {
      preserved: state.variants.length,
      needsRebase: state.variants.filter(
        (variant) => variant.sourceVersion !== nextSource.version,
      ).length,
    },
    profile,
    source: nextSource,
    warnings,
  });
}
