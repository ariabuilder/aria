/**
 * Media catalog persistence (D1). Canonical per-asset authorship
 * targets `aria_media_assets` actor columns (`created_by_*`, `updated_by_*`, `deleted_by_*`).
 */

import { z } from "astro/zod";
import { getCloudflareEnv, type RuntimeLocals } from "../../cloudflare/env";
import { EndpointIdSchema } from "../endpoints/ids";
import {
  appendMediaAuthorshipUpdateSets,
  appendSqlFragment,
  buildMediaAssetInsertAuthorship,
} from "../../authorship/stamping";
import {
  type MediaAssetAuthorshipContext,
  parseMediaAssetAuthorshipContext,
} from "./authorshipSchemas";
import {
  logicalPathToObjectKey,
  normalizeLogicalMediaPath,
} from "../utils/path";

const MEDIA_ASSETS_TABLE = "aria_media_assets" as const;
const MEDIA_LOCATIONS_TABLE = "aria_media_locations" as const;

export const MediaCatalogTableNameSchema = z.enum([
  MEDIA_ASSETS_TABLE,
  MEDIA_LOCATIONS_TABLE,
]);

type D1Prepared = {
  bind: (...args: unknown[]) => D1Prepared;
  run: () => Promise<unknown>;
  first: <T = unknown>() => Promise<T | null>;
};

type D1DatabaseLike = {
  prepare: (sql: string) => D1Prepared;
};

const MediaAssetIdentityRowSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

const MediaAssetRowSchema = z
  .object({
    id: z.string().min(1),
    logical_path: z.string().min(1),
    mime_type: z.string().nullable().optional(),
  })
  .strict();

export const MediaAssetCatalogListRowSchema = z
  .object({
    id: z.string().min(1),
    logical_path: z.string().min(1),
    filename: z.string().min(1),
    mime_type: z.string().nullable().optional(),
    size_bytes: z.int().nonnegative(),
    width: z.int().nonnegative().nullable().optional(),
    height: z.int().nonnegative().nullable().optional(),
    status: z.enum(["active", "deleted"]),
    updated_at: z.string().min(1),
    public_url: z.string().nullable().optional(),
  })
  .strict();

export type MediaAssetCatalogListRow = z.infer<
  typeof MediaAssetCatalogListRowSchema
>;

const MediaLocationIdentityRowSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export const UpsertUploadedMediaInputSchema = z
  .object({
    logicalPath: z.string().min(1),
    filename: z.string().min(1),
    extension: z.string().optional(),
    mimeType: z.string().optional(),
    sizeBytes: z.int().nonnegative(),
    checksumSha256: z.string().min(1),
    endpointId: EndpointIdSchema,
    publicUrl: z.string().optional(),
    objectKey: z.string().optional(),
    etag: z.string().optional(),
    updatedAt: z.string().min(1),
  })
  .strict();

export type UpsertUploadedMediaInput = z.infer<
  typeof UpsertUploadedMediaInputSchema
>;

export const MarkDeletedMediaInputSchema = z
  .object({
    logicalPath: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export type MarkDeletedMediaInput = z.infer<typeof MarkDeletedMediaInputSchema>;

export const MoveMediaInputSchema = z
  .object({
    oldLogicalPath: z.string().min(1),
    newLogicalPath: z.string().min(1),
    filename: z.string().min(1),
    extension: z.string().optional(),
    mimeType: z.string().optional(),
    sizeBytes: z.int().nonnegative(),
    checksumSha256: z.string().min(1),
    endpointId: EndpointIdSchema,
    publicUrl: z.string().optional(),
    objectKey: z.string().optional(),
    etag: z.string().optional(),
    updatedAt: z.string().min(1),
  })
  .strict();

export type MoveMediaInput = z.infer<typeof MoveMediaInputSchema>;

export interface MediaCatalogStorageExecutor {
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  queryAll<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T[]>;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
}

export {
  MediaAssetAuthorshipContextSchema,
  type MediaAssetAuthorshipContext,
  parseMediaAssetAuthorshipContext,
} from "./authorshipSchemas";

export function parseUpsertUploadedMediaInput(
  value: unknown,
): UpsertUploadedMediaInput {
  return UpsertUploadedMediaInputSchema.parse(value);
}

export function parseMarkDeletedMediaInput(
  value: unknown,
): MarkDeletedMediaInput {
  return MarkDeletedMediaInputSchema.parse(value);
}

export function parseMoveMediaInput(value: unknown): MoveMediaInput {
  return MoveMediaInputSchema.parse(value);
}

export class MediaCatalogRepository {
  private readonly storage: MediaCatalogStorageExecutor;

  private constructor(storage: MediaCatalogStorageExecutor) {
    this.storage = storage;
  }

  static fromExecutor(
    storage: MediaCatalogStorageExecutor,
  ): MediaCatalogRepository {
    return new MediaCatalogRepository(storage);
  }

  static tryCreate(locals?: RuntimeLocals): MediaCatalogRepository | null {
    const db = getCloudflareEnv(locals).aria_db as D1DatabaseLike | undefined;
    if (!db || typeof db.prepare !== "function") {
      return null;
    }

    return new MediaCatalogRepository({
      queryFirst: <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) =>
        db
          .prepare(sql)
          .bind(...args)
          .first<T>(),
      queryAll: async <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => {
        const result = (await db
          .prepare(sql)
          .bind(...args)
          .run()) as {
          results?: T[];
        } | null;
        return result?.results ?? [];
      },
      run: async (sql: string, args: readonly unknown[] = []) => {
        await db
          .prepare(sql)
          .bind(...args)
          .run();
      },
    });
  }

  private async alignUsageLogicalPath(
    mediaId: string,
    logicalPath: string,
    updatedAt: string,
  ): Promise<void> {
    await this.storage.run(
      `DELETE FROM aria_media_usage
        WHERE media_id IS NULL
          AND logical_path = ?
          AND EXISTS (
            SELECT 1
              FROM aria_media_usage AS resolved
             WHERE resolved.media_id = ?
               AND resolved.kind = aria_media_usage.kind
               AND resolved.ref_id = aria_media_usage.ref_id
          )`,
      [logicalPath, mediaId],
    );
    await this.storage.run(
      `UPDATE aria_media_usage
          SET logical_path = ?, updated_at = ?
        WHERE media_id = ?`,
      [logicalPath, updatedAt, mediaId],
    );
  }

  async upsertUploadedMedia(
    input: UpsertUploadedMediaInput,
    authorship?: MediaAssetAuthorshipContext,
  ): Promise<{
    mediaId: string;
    locationId: string;
    logicalPath: string;
  }> {
    const parsed = UpsertUploadedMediaInputSchema.parse(input);
    const parsedAuthorship = authorship
      ? parseMediaAssetAuthorshipContext(authorship)
      : undefined;
    const logicalPath = normalizeLogicalMediaPath(parsed.logicalPath);
    const objectKey = parsed.objectKey ?? logicalPathToObjectKey(logicalPath);

    const existingAssetRaw = await this.storage.queryFirst(
      `SELECT id FROM ${MEDIA_ASSETS_TABLE} WHERE logical_path = ? LIMIT 1`,
      [logicalPath],
    );

    const existingAsset = existingAssetRaw
      ? MediaAssetIdentityRowSchema.parse(existingAssetRaw)
      : null;

    const mediaId = existingAsset?.id ?? crypto.randomUUID();

    if (existingAsset) {
      const updateSets = appendMediaAuthorshipUpdateSets(
        [
          "filename = ?",
          "extension = ?",
          "mime_type = ?",
          "size_bytes = ?",
          "checksum_sha256 = ?",
          "status = 'active'",
          "deleted_at = NULL",
          "updated_at = ?",
        ],
        [
          parsed.filename,
          parsed.extension ?? null,
          parsed.mimeType ?? null,
          parsed.sizeBytes,
          parsed.checksumSha256,
          parsed.updatedAt,
        ],
        parsedAuthorship?.mutationKind === "restore" ? "restore" : "update",
        parsedAuthorship,
      );

      await this.storage.run(
        `UPDATE ${MEDIA_ASSETS_TABLE}
              SET ${updateSets.setClauses}
            WHERE id = ?`,
        [...updateSets.values, mediaId],
      );
    } else {
      const insertPayload = appendSqlFragment(
        [
          "id",
          "logical_path",
          "filename",
          "extension",
          "mime_type",
          "size_bytes",
          "checksum_sha256",
          "status",
          "created_at",
          "updated_at",
        ],
        [
          mediaId,
          logicalPath,
          parsed.filename,
          parsed.extension ?? null,
          parsed.mimeType ?? null,
          parsed.sizeBytes,
          parsed.checksumSha256,
          "active",
          parsed.updatedAt,
          parsed.updatedAt,
        ],
        buildMediaAssetInsertAuthorship(parsedAuthorship),
      );

      await this.storage.run(
        `INSERT INTO ${MEDIA_ASSETS_TABLE} (${insertPayload.columns.join(", ")})
          VALUES (${insertPayload.columns.map(() => "?").join(", ")})`,
        insertPayload.values,
      );
    }

    const existingLocationRaw = await this.storage.queryFirst(
      `SELECT id
           FROM ${MEDIA_LOCATIONS_TABLE}
          WHERE media_id = ? AND endpoint_id = ?
          LIMIT 1`,
      [mediaId, parsed.endpointId],
    );

    const existingLocation = existingLocationRaw
      ? MediaLocationIdentityRowSchema.parse(existingLocationRaw)
      : null;

    const locationId = existingLocation?.id ?? crypto.randomUUID();

    if (existingLocation) {
      await this.storage.run(
        `UPDATE ${MEDIA_LOCATIONS_TABLE}
              SET object_key = ?,
                  public_url = ?,
                  etag = ?,
                  size_bytes = ?,
                  checksum_sha256 = ?,
                  exists_remote = 1,
                  last_verified_at = ?,
                  updated_at = ?
            WHERE id = ?`,
        [
          objectKey,
          parsed.publicUrl ?? null,
          parsed.etag ?? null,
          parsed.sizeBytes,
          parsed.checksumSha256,
          parsed.updatedAt,
          parsed.updatedAt,
          locationId,
        ],
      );
    } else {
      await this.storage.run(
        `INSERT INTO ${MEDIA_LOCATIONS_TABLE} (
              id,
              media_id,
              endpoint_id,
              object_key,
              public_url,
              etag,
              size_bytes,
              checksum_sha256,
              exists_remote,
              last_verified_at,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [
          locationId,
          mediaId,
          parsed.endpointId,
          objectKey,
          parsed.publicUrl ?? null,
          parsed.etag ?? null,
          parsed.sizeBytes,
          parsed.checksumSha256,
          parsed.updatedAt,
          parsed.updatedAt,
          parsed.updatedAt,
        ],
      );
    }

    await this.alignUsageLogicalPath(mediaId, logicalPath, parsed.updatedAt);

    return {
      mediaId,
      locationId,
      logicalPath,
    };
  }

  async markDeleted(
    input: MarkDeletedMediaInput,
    authorship?: MediaAssetAuthorshipContext,
  ): Promise<{ found: boolean }> {
    const parsed = MarkDeletedMediaInputSchema.parse(input);
    const parsedAuthorship = authorship
      ? parseMediaAssetAuthorshipContext(authorship)
      : undefined;
    const logicalPath = normalizeLogicalMediaPath(parsed.logicalPath);

    const assetRaw = await this.storage.queryFirst(
      `SELECT id, logical_path, mime_type
           FROM ${MEDIA_ASSETS_TABLE}
          WHERE logical_path = ?
          LIMIT 1`,
      [logicalPath],
    );

    const asset = assetRaw ? MediaAssetRowSchema.safeParse(assetRaw) : null;
    if (!asset || !asset.success) {
      return { found: false };
    }

    const updateSets = appendMediaAuthorshipUpdateSets(
      ["status = 'deleted'", "deleted_at = ?", "updated_at = ?"],
      [parsed.updatedAt, parsed.updatedAt],
      "delete",
      parsedAuthorship,
    );

    await this.storage.run(
      `UPDATE ${MEDIA_ASSETS_TABLE}
            SET ${updateSets.setClauses}
          WHERE id = ?`,
      [...updateSets.values, asset.data.id],
    );

    await this.storage.run(
      `UPDATE ${MEDIA_LOCATIONS_TABLE}
            SET exists_remote = 0,
                last_verified_at = ?,
                updated_at = ?
          WHERE media_id = ?`,
      [parsed.updatedAt, parsed.updatedAt, asset.data.id],
    );

    return { found: true };
  }

  async moveMedia(
    input: MoveMediaInput,
    authorship?: MediaAssetAuthorshipContext,
  ): Promise<{
    moved: boolean;
    logicalPath: string;
  }> {
    const parsed = MoveMediaInputSchema.parse(input);
    const parsedAuthorship = authorship
      ? parseMediaAssetAuthorshipContext(authorship)
      : undefined;
    const oldLogicalPath = normalizeLogicalMediaPath(parsed.oldLogicalPath);
    const newLogicalPath = normalizeLogicalMediaPath(parsed.newLogicalPath);
    const objectKey =
      parsed.objectKey ?? logicalPathToObjectKey(newLogicalPath);

    const sourceAssetRaw = await this.storage.queryFirst(
      `SELECT id, logical_path, mime_type
           FROM ${MEDIA_ASSETS_TABLE}
          WHERE logical_path = ?
          LIMIT 1`,
      [oldLogicalPath],
    );

    const sourceAsset = sourceAssetRaw
      ? MediaAssetRowSchema.safeParse(sourceAssetRaw)
      : null;

    if (!sourceAsset || !sourceAsset.success) {
      await this.upsertUploadedMedia(
        {
          logicalPath: newLogicalPath,
          filename: parsed.filename,
          extension: parsed.extension,
          mimeType: parsed.mimeType,
          sizeBytes: parsed.sizeBytes,
          checksumSha256: parsed.checksumSha256,
          endpointId: parsed.endpointId,
          publicUrl: parsed.publicUrl,
          objectKey,
          etag: parsed.etag,
          updatedAt: parsed.updatedAt,
        },
        parsedAuthorship,
      );

      return {
        moved: false,
        logicalPath: newLogicalPath,
      };
    }

    const updateSets = appendMediaAuthorshipUpdateSets(
      [
        "logical_path = ?",
        "filename = ?",
        "extension = ?",
        "mime_type = ?",
        "size_bytes = ?",
        "checksum_sha256 = ?",
        "status = 'active'",
        "deleted_at = NULL",
        "updated_at = ?",
      ],
      [
        newLogicalPath,
        parsed.filename,
        parsed.extension ?? null,
        parsed.mimeType ?? sourceAsset.data.mime_type ?? null,
        parsed.sizeBytes,
        parsed.checksumSha256,
        parsed.updatedAt,
      ],
      "update",
      parsedAuthorship,
    );

    await this.storage.run(
      `UPDATE ${MEDIA_ASSETS_TABLE}
            SET ${updateSets.setClauses}
          WHERE id = ?`,
      [...updateSets.values, sourceAsset.data.id],
    );

    const existingLocationRaw = await this.storage.queryFirst(
      `SELECT id
           FROM ${MEDIA_LOCATIONS_TABLE}
          WHERE media_id = ? AND endpoint_id = ?
          LIMIT 1`,
      [sourceAsset.data.id, parsed.endpointId],
    );

    const existingLocation = existingLocationRaw
      ? MediaLocationIdentityRowSchema.safeParse(existingLocationRaw)
      : null;

    if (existingLocation && existingLocation.success) {
      await this.storage.run(
        `UPDATE ${MEDIA_LOCATIONS_TABLE}
              SET object_key = ?,
                  public_url = ?,
                  etag = ?,
                  size_bytes = ?,
                  checksum_sha256 = ?,
                  exists_remote = 1,
                  last_verified_at = ?,
                  updated_at = ?
            WHERE id = ?`,
        [
          objectKey,
          parsed.publicUrl ?? null,
          parsed.etag ?? null,
          parsed.sizeBytes,
          parsed.checksumSha256,
          parsed.updatedAt,
          parsed.updatedAt,
          existingLocation.data.id,
        ],
      );
    } else {
      await this.storage.run(
        `INSERT INTO ${MEDIA_LOCATIONS_TABLE} (
              id,
              media_id,
              endpoint_id,
              object_key,
              public_url,
              etag,
              size_bytes,
              checksum_sha256,
              exists_remote,
              last_verified_at,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          sourceAsset.data.id,
          parsed.endpointId,
          objectKey,
          parsed.publicUrl ?? null,
          parsed.etag ?? null,
          parsed.sizeBytes,
          parsed.checksumSha256,
          parsed.updatedAt,
          parsed.updatedAt,
          parsed.updatedAt,
        ],
      );
    }

    await this.alignUsageLogicalPath(
      sourceAsset.data.id,
      newLogicalPath,
      parsed.updatedAt,
    );

    return {
      moved: true,
      logicalPath: newLogicalPath,
    };
  }

  /**
   * Batch-load catalog rows for page media resolution (chunked IN queries).
   */
  async listAssetsByLogicalPaths(
    logicalPaths: readonly string[],
  ): Promise<MediaAssetCatalogListRow[]> {
    if (logicalPaths.length === 0) {
      return [];
    }

    const chunkSize = 50;
    const results: MediaAssetCatalogListRow[] = [];

    for (let offset = 0; offset < logicalPaths.length; offset += chunkSize) {
      const chunk = logicalPaths.slice(offset, offset + chunkSize);
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = await this.storage.queryAll<Record<string, unknown>>(
        `SELECT assets.id,
                  assets.logical_path,
                  assets.filename,
                  assets.mime_type,
                  assets.size_bytes,
                  assets.width,
                  assets.height,
                  assets.status,
                  assets.updated_at,
                  (
                    SELECT locations.public_url
                      FROM ${MEDIA_LOCATIONS_TABLE} AS locations
                     WHERE locations.media_id = assets.id
                     ORDER BY locations.updated_at DESC
                     LIMIT 1
                  ) AS public_url
             FROM ${MEDIA_ASSETS_TABLE} AS assets
            WHERE assets.logical_path IN (${placeholders})`,
        chunk,
      );

      for (const row of rows) {
        const parsed = MediaAssetCatalogListRowSchema.safeParse(row);
        if (parsed.success) {
          results.push(parsed.data);
        }
      }
    }

    return results;
  }

  /**
   * Batch-load catalog rows by asset id (CMS image field mediaId values).
   */
  async listAssetsByIds(
    mediaIds: readonly string[],
  ): Promise<MediaAssetCatalogListRow[]> {
    if (mediaIds.length === 0) {
      return [];
    }

    const chunkSize = 50;
    const results: MediaAssetCatalogListRow[] = [];

    for (let offset = 0; offset < mediaIds.length; offset += chunkSize) {
      const chunk = mediaIds.slice(offset, offset + chunkSize);
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = await this.storage.queryAll<Record<string, unknown>>(
        `SELECT assets.id,
                  assets.logical_path,
                  assets.filename,
                  assets.mime_type,
                  assets.size_bytes,
                  assets.width,
                  assets.height,
                  assets.status,
                  assets.updated_at,
                  (
                    SELECT locations.public_url
                      FROM ${MEDIA_LOCATIONS_TABLE} AS locations
                     WHERE locations.media_id = assets.id
                     ORDER BY locations.updated_at DESC
                     LIMIT 1
                  ) AS public_url
             FROM ${MEDIA_ASSETS_TABLE} AS assets
            WHERE assets.id IN (${placeholders})`,
        chunk,
      );

      for (const row of rows) {
        const parsed = MediaAssetCatalogListRowSchema.safeParse(row);
        if (parsed.success) {
          results.push(parsed.data);
        }
      }
    }

    return results;
  }
}
