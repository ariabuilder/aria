import {
  MediaAssetProfileSchema,
  MediaSourceVersionSchema,
  PromoteMediaSourceVersionInputSchema,
  RelocateMediaSourceVersionInputSchema,
  MediaTransformStateSchema,
  MediaTransformVariantSchema,
  SaveMediaAssetProfileInputSchema,
  SaveMediaTransformVariantInputSchema,
  type MediaAssetProfile,
  type MediaSourceVersion,
  type PromoteMediaSourceVersionInput,
  type RelocateMediaSourceVersionInput,
  type MediaTransformState,
  type MediaTransformVariant,
  type SaveMediaAssetProfileInput,
  type SaveMediaTransformVariantInput,
} from "./schemas";
import {
  logicalPathToObjectKey,
  normalizeLogicalMediaPath,
} from "../utils/path";

type Row = Record<string, unknown>;

export interface MediaTransformStorageExecutor {
  queryFirst<T extends Row>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  queryAll<T extends Row>(sql: string, args?: readonly unknown[]): Promise<T[]>;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
  runBatch?(
    statements: Array<{ sql: string; args?: readonly unknown[] }>,
  ): Promise<void>;
}

export class MediaTransformConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaTransformConflictError";
  }
}

async function executeStatements(
  executor: MediaTransformStorageExecutor,
  statements: Array<{ sql: string; args?: readonly unknown[] }>,
): Promise<void> {
  if (executor.runBatch) {
    await executor.runBatch(statements);
    return;
  }
  for (const statement of statements) {
    await executor.run(statement.sql, statement.args);
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function profileFromRow(row: Row): MediaAssetProfile {
  return MediaAssetProfileSchema.parse({
    assetPath: row.asset_path,
    currentSourceVersion: Number(row.current_source_version),
    altText: row.alt_text ?? null,
    title: row.title ?? null,
    caption: row.caption ?? null,
    credit: row.credit ?? null,
    copyright: row.copyright ?? null,
    focalPoint: parseJson(row.focal_point_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function sourceVersionFromRow(row: Row): MediaSourceVersion {
  return MediaSourceVersionSchema.parse({
    assetPath: row.asset_path,
    version: Number(row.version),
    objectKey: row.object_key,
    checksumSha256: row.checksum_sha256 ?? null,
    mimeType: row.mime_type ?? null,
    sizeBytes: Number(row.size_bytes),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    createdAt: row.created_at,
  });
}

function variantFromRow(row: Row): MediaTransformVariant {
  return MediaTransformVariantSchema.parse({
    id: row.id,
    assetPath: row.asset_path,
    name: row.name,
    sourceVersion: Number(row.source_version),
    crop: parseJson(row.crop_json),
    focalPoint: parseJson(row.focal_point_json),
    aspectRatio: parseJson(row.aspect_ratio_json),
    output: parseJson(row.output_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function getMediaTransformState(
  executor: MediaTransformStorageExecutor,
  rawAssetPath: string,
): Promise<MediaTransformState> {
  const assetPath = normalizeLogicalMediaPath(rawAssetPath);
  const [profileRow, sourceRows, variantRows] = await Promise.all([
    executor.queryFirst<Row>(
      `SELECT * FROM aria_media_profiles WHERE asset_path = ? LIMIT 1`,
      [assetPath],
    ),
    executor.queryAll<Row>(
      `SELECT * FROM aria_media_source_versions
        WHERE asset_path = ? ORDER BY version DESC`,
      [assetPath],
    ),
    executor.queryAll<Row>(
      `SELECT * FROM aria_media_transform_variants
        WHERE asset_path = ? ORDER BY name ASC`,
      [assetPath],
    ),
  ]);

  return MediaTransformStateSchema.parse({
    profile: profileRow ? profileFromRow(profileRow) : null,
    sourceVersions: sourceRows.map(sourceVersionFromRow),
    variants: variantRows.map(variantFromRow),
  });
}

export async function listMediaTransformVariantCounts(
  executor: MediaTransformStorageExecutor,
): Promise<Record<string, number>> {
  const rows = await executor.queryAll<Row>(
    `SELECT asset_path, COUNT(*) AS variant_count
       FROM aria_media_transform_variants
      GROUP BY asset_path`,
  );

  return Object.fromEntries(
    rows.map((row) => [
      normalizeLogicalMediaPath(String(row.asset_path)),
      Number(row.variant_count),
    ]),
  );
}

export async function getMediaTransformVariant(
  executor: MediaTransformStorageExecutor,
  id: string,
): Promise<MediaTransformVariant | null> {
  const row = await executor.queryFirst<Row>(
    `SELECT * FROM aria_media_transform_variants WHERE id = ? LIMIT 1`,
    [id],
  );
  return row ? variantFromRow(row) : null;
}

export async function registerMediaSourceVersion(
  executor: MediaTransformStorageExecutor,
  rawInput: MediaSourceVersion,
): Promise<MediaSourceVersion> {
  const input = MediaSourceVersionSchema.parse({
    ...rawInput,
    assetPath: normalizeLogicalMediaPath(rawInput.assetPath),
  });

  const existing = await executor.queryFirst<Row>(
    `SELECT * FROM aria_media_source_versions
      WHERE asset_path = ? AND version = ? LIMIT 1`,
    [input.assetPath, input.version],
  );
  if (existing) {
    const stored = sourceVersionFromRow(existing);
    if (
      stored.objectKey !== input.objectKey ||
      stored.checksumSha256 !== input.checksumSha256 ||
      stored.mimeType !== input.mimeType ||
      stored.sizeBytes !== input.sizeBytes ||
      stored.width !== input.width ||
      stored.height !== input.height
    ) {
      throw new MediaTransformConflictError(
        "Media source versions are immutable. Register a new version instead.",
      );
    }
    return stored;
  }

  await executor.run(
    `INSERT INTO aria_media_source_versions (
       asset_path, version, object_key, checksum_sha256, mime_type,
       size_bytes, width, height, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset_path, version) DO NOTHING`,
    [
      input.assetPath,
      input.version,
      input.objectKey,
      input.checksumSha256,
      input.mimeType,
      input.sizeBytes,
      input.width,
      input.height,
      input.createdAt,
    ],
  );

  const persisted = await executor.queryFirst<Row>(
    `SELECT * FROM aria_media_source_versions
      WHERE asset_path = ? AND version = ? LIMIT 1`,
    [input.assetPath, input.version],
  );
  if (!persisted) throw new Error("Media source version did not persist");
  const stored = sourceVersionFromRow(persisted);
  if (
    stored.objectKey !== input.objectKey ||
    stored.checksumSha256 !== input.checksumSha256 ||
    stored.mimeType !== input.mimeType ||
    stored.sizeBytes !== input.sizeBytes ||
    stored.width !== input.width ||
    stored.height !== input.height
  ) {
    throw new MediaTransformConflictError(
      "Media source versions are immutable. Register a new version instead.",
    );
  }
  return stored;
}

export async function relocateMediaSourceVersionObject(
  executor: MediaTransformStorageExecutor,
  rawInput: RelocateMediaSourceVersionInput,
): Promise<MediaSourceVersion> {
  const input = RelocateMediaSourceVersionInputSchema.parse({
    ...rawInput,
    assetPath: normalizeLogicalMediaPath(rawInput.assetPath),
  });
  const existing = await executor.queryFirst<Row>(
    `SELECT * FROM aria_media_source_versions
      WHERE asset_path = ? AND version = ? LIMIT 1`,
    [input.assetPath, input.version],
  );
  if (!existing) {
    throw new MediaTransformConflictError(
      "The source version no longer exists.",
    );
  }
  const stored = sourceVersionFromRow(existing);
  if (stored.objectKey === input.objectKey) return stored;
  if (stored.objectKey !== input.expectedObjectKey) {
    throw new MediaTransformConflictError(
      "The source version moved in another session. Reload before replacing.",
    );
  }
  if (stored.checksumSha256 && stored.checksumSha256 !== input.checksumSha256) {
    throw new MediaTransformConflictError(
      "The stored source checksum does not match the current media object.",
    );
  }

  await executor.run(
    `UPDATE aria_media_source_versions
        SET object_key = ?, checksum_sha256 = ?, mime_type = ?,
            size_bytes = ?, width = ?, height = ?
      WHERE asset_path = ? AND version = ? AND object_key = ?`,
    [
      input.objectKey,
      input.checksumSha256,
      input.mimeType,
      input.sizeBytes,
      input.width,
      input.height,
      input.assetPath,
      input.version,
      input.expectedObjectKey,
    ],
  );
  const relocated = await executor.queryFirst<Row>(
    `SELECT * FROM aria_media_source_versions
      WHERE asset_path = ? AND version = ? LIMIT 1`,
    [input.assetPath, input.version],
  );
  if (!relocated || relocated.object_key !== input.objectKey) {
    throw new MediaTransformConflictError(
      "The source version changed while it was being preserved.",
    );
  }
  return sourceVersionFromRow(relocated);
}

export async function promoteMediaSourceVersion(
  executor: MediaTransformStorageExecutor,
  rawInput: PromoteMediaSourceVersionInput,
  now = new Date().toISOString(),
): Promise<MediaAssetProfile> {
  const input = PromoteMediaSourceVersionInputSchema.parse({
    ...rawInput,
    assetPath: normalizeLogicalMediaPath(rawInput.assetPath),
  });
  const [source, existing] = await Promise.all([
    executor.queryFirst<Row>(
      `SELECT version FROM aria_media_source_versions
        WHERE asset_path = ? AND version = ? LIMIT 1`,
      [input.assetPath, input.nextSourceVersion],
    ),
    executor.queryFirst<Row>(
      `SELECT * FROM aria_media_profiles WHERE asset_path = ? LIMIT 1`,
      [input.assetPath],
    ),
  ]);
  if (!source) {
    throw new MediaTransformConflictError(
      "The replacement source must be registered before promotion.",
    );
  }
  const currentVersion = Number(existing?.current_source_version ?? 1);
  if (currentVersion !== input.previousSourceVersion) {
    throw new MediaTransformConflictError(
      "The source image changed in another session. Reload before replacing.",
    );
  }
  if (
    input.expectedUpdatedAt !== undefined &&
    (existing?.updated_at ?? null) !== input.expectedUpdatedAt
  ) {
    throw new MediaTransformConflictError(
      "This asset was updated in another session. Reload before replacing.",
    );
  }

  if (existing) {
    await executor.run(
      `UPDATE aria_media_profiles
          SET current_source_version = ?, updated_at = ?
        WHERE asset_path = ? AND current_source_version = ? AND updated_at = ?`,
      [
        input.nextSourceVersion,
        now,
        input.assetPath,
        input.previousSourceVersion,
        existing.updated_at,
      ],
    );
  } else {
    await executor.run(
      `INSERT INTO aria_media_profiles (
         asset_path, current_source_version, alt_text, title, caption, credit,
         copyright, focal_point_json, created_at, updated_at
       ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
       ON CONFLICT(asset_path) DO NOTHING`,
      [input.assetPath, input.nextSourceVersion, now, now],
    );
  }

  const promoted = await executor.queryFirst<Row>(
    `SELECT * FROM aria_media_profiles WHERE asset_path = ? LIMIT 1`,
    [input.assetPath],
  );
  if (
    !promoted ||
    Number(promoted.current_source_version) !== input.nextSourceVersion
  ) {
    throw new MediaTransformConflictError(
      "The source image changed while the replacement was being promoted.",
    );
  }
  return profileFromRow(promoted);
}

export async function saveMediaAssetProfile(
  executor: MediaTransformStorageExecutor,
  rawInput: SaveMediaAssetProfileInput,
  now = new Date().toISOString(),
): Promise<MediaAssetProfile> {
  const input = SaveMediaAssetProfileInputSchema.parse({
    ...rawInput,
    assetPath: normalizeLogicalMediaPath(rawInput.assetPath),
  });
  const existing = await executor.queryFirst<Row>(
    `SELECT current_source_version, updated_at
       FROM aria_media_profiles WHERE asset_path = ? LIMIT 1`,
    [input.assetPath],
  );

  if (
    input.expectedUpdatedAt !== undefined &&
    (existing?.updated_at ?? null) !== input.expectedUpdatedAt
  ) {
    throw new MediaTransformConflictError(
      "This asset was updated in another session. Reload before saving.",
    );
  }
  if (
    existing &&
    Number(existing.current_source_version) !== input.currentSourceVersion
  ) {
    throw new MediaTransformConflictError(
      "Source replacement must register and promote a new source version atomically.",
    );
  }

  await executor.run(
    `INSERT INTO aria_media_profiles (
       asset_path, current_source_version, alt_text, title, caption, credit,
       copyright, focal_point_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset_path) DO UPDATE SET
       current_source_version = excluded.current_source_version,
       alt_text = excluded.alt_text,
       title = excluded.title,
       caption = excluded.caption,
       credit = excluded.credit,
       copyright = excluded.copyright,
       focal_point_json = excluded.focal_point_json,
       updated_at = excluded.updated_at`,
    [
      input.assetPath,
      input.currentSourceVersion,
      input.altText,
      input.title,
      input.caption,
      input.credit,
      input.copyright,
      input.focalPoint ? JSON.stringify(input.focalPoint) : null,
      now,
      now,
    ],
  );

  const row = await executor.queryFirst<Row>(
    `SELECT * FROM aria_media_profiles WHERE asset_path = ? LIMIT 1`,
    [input.assetPath],
  );
  if (!row) throw new Error("Media profile save did not persist");
  return profileFromRow(row);
}

export async function saveMediaTransformVariant(
  executor: MediaTransformStorageExecutor,
  rawInput: SaveMediaTransformVariantInput,
  now = new Date().toISOString(),
): Promise<MediaTransformVariant> {
  const input = SaveMediaTransformVariantInputSchema.parse({
    ...rawInput,
    assetPath: normalizeLogicalMediaPath(rawInput.assetPath),
  });
  const [profile, existing] = await Promise.all([
    executor.queryFirst<Row>(
      `SELECT current_source_version FROM aria_media_profiles
        WHERE asset_path = ? LIMIT 1`,
      [input.assetPath],
    ),
    executor.queryFirst<Row>(
      `SELECT asset_path, updated_at FROM aria_media_transform_variants
        WHERE id = ? LIMIT 1`,
      [input.id],
    ),
  ]);

  const nameOwner = await executor.queryFirst<Row>(
    `SELECT id FROM aria_media_transform_variants
      WHERE asset_path = ? AND name = ? LIMIT 1`,
    [input.assetPath, input.name],
  );

  const currentSourceVersion = Number(profile?.current_source_version ?? 1);
  if (input.sourceVersion !== currentSourceVersion) {
    throw new MediaTransformConflictError(
      "The source image changed while this crop was open. Reload before saving.",
    );
  }
  if (existing && existing.asset_path !== input.assetPath) {
    throw new MediaTransformConflictError(
      "A transform variant cannot be moved between assets.",
    );
  }
  if (nameOwner && nameOwner.id !== input.id) {
    throw new MediaTransformConflictError(
      "A saved crop with this name already exists for the asset.",
    );
  }
  if (
    input.expectedUpdatedAt !== undefined &&
    (existing?.updated_at ?? null) !== input.expectedUpdatedAt
  ) {
    throw new MediaTransformConflictError(
      "This crop was updated in another session. Reload before saving.",
    );
  }

  if (!profile) {
    await saveMediaAssetProfile(
      executor,
      {
        assetPath: input.assetPath,
        currentSourceVersion: input.sourceVersion,
        altText: null,
        title: null,
        caption: null,
        credit: null,
        copyright: null,
        focalPoint: input.focalPoint,
      },
      now,
    );
  }

  await executor.run(
    `INSERT INTO aria_media_transform_variants (
       id, asset_path, name, source_version, crop_json, focal_point_json,
       aspect_ratio_json, output_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       source_version = excluded.source_version,
       crop_json = excluded.crop_json,
       focal_point_json = excluded.focal_point_json,
       aspect_ratio_json = excluded.aspect_ratio_json,
       output_json = excluded.output_json,
       updated_at = excluded.updated_at`,
    [
      input.id,
      input.assetPath,
      input.name,
      input.sourceVersion,
      JSON.stringify(input.crop),
      input.focalPoint ? JSON.stringify(input.focalPoint) : null,
      input.aspectRatio ? JSON.stringify(input.aspectRatio) : null,
      JSON.stringify(input.output),
      now,
      now,
    ],
  );

  const row = await executor.queryFirst<Row>(
    `SELECT * FROM aria_media_transform_variants WHERE id = ? LIMIT 1`,
    [input.id],
  );
  if (!row) throw new Error("Media transform variant save did not persist");
  return variantFromRow(row);
}

export async function deleteMediaTransformVariant(
  executor: MediaTransformStorageExecutor,
  assetPath: string,
  id: string,
): Promise<void> {
  await executor.run(
    `DELETE FROM aria_media_transform_variants WHERE id = ? AND asset_path = ?`,
    [id, normalizeLogicalMediaPath(assetPath)],
  );
}

export async function moveMediaTransformState(
  executor: MediaTransformStorageExecutor,
  rawOldAssetPath: string,
  rawNewAssetPath: string,
): Promise<void> {
  const oldAssetPath = normalizeLogicalMediaPath(rawOldAssetPath);
  const newAssetPath = normalizeLogicalMediaPath(rawNewAssetPath);
  if (oldAssetPath === newAssetPath) return;

  const target = await executor.queryFirst<Row>(
    `SELECT asset_path FROM (
       SELECT asset_path FROM aria_media_profiles WHERE asset_path = ?
       UNION ALL
       SELECT asset_path FROM aria_media_source_versions WHERE asset_path = ?
       UNION ALL
       SELECT asset_path FROM aria_media_transform_variants WHERE asset_path = ?
     ) LIMIT 1`,
    [newAssetPath, newAssetPath, newAssetPath],
  );
  if (target) {
    throw new MediaTransformConflictError(
      "The destination already has image editing state.",
    );
  }

  const oldObjectKey = logicalPathToObjectKey(oldAssetPath);
  const newObjectKey = logicalPathToObjectKey(newAssetPath);
  await executeStatements(executor, [
    {
      sql: `UPDATE aria_media_profiles SET asset_path = ?, updated_at = ?
            WHERE asset_path = ?`,
      args: [newAssetPath, new Date().toISOString(), oldAssetPath],
    },
    {
      sql: `UPDATE aria_media_source_versions
              SET asset_path = ?,
                  object_key = CASE WHEN object_key = ? THEN ? ELSE object_key END
            WHERE asset_path = ?`,
      args: [newAssetPath, oldObjectKey, newObjectKey, oldAssetPath],
    },
    {
      sql: `UPDATE aria_media_transform_variants SET asset_path = ?
            WHERE asset_path = ?`,
      args: [newAssetPath, oldAssetPath],
    },
  ]);
}

export async function deleteMediaTransformState(
  executor: MediaTransformStorageExecutor,
  rawAssetPath: string,
): Promise<void> {
  const assetPath = normalizeLogicalMediaPath(rawAssetPath);
  await executeStatements(executor, [
    {
      sql: `DELETE FROM aria_media_transform_variants WHERE asset_path = ?`,
      args: [assetPath],
    },
    {
      sql: `DELETE FROM aria_media_source_versions WHERE asset_path = ?`,
      args: [assetPath],
    },
    {
      sql: `DELETE FROM aria_media_profiles WHERE asset_path = ?`,
      args: [assetPath],
    },
  ]);
}
