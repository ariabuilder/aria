import type { StorageAdapter } from "../../adapter";
import type {
  WordPressImportBatch,
  WordPressImportEvent,
  WordPressImportFile,
  WordPressImportItem,
  WordPressImportMapping,
  WordPressImportMedia,
} from "../../../wordpress-import/schemas";
import {
  mapWordPressImportBatchRow,
  mapWordPressImportEventRow,
  mapWordPressImportFileRow,
  mapWordPressImportItemRow,
  mapWordPressImportMappingRow,
  mapWordPressImportMediaRow,
} from "../../../wordpress-import/storage";

export type WordPressImportStorageDomain = Pick<
  StorageAdapter,
  | "listWordPressImportBatches"
  | "getWordPressImportBatch"
  | "saveWordPressImportBatch"
  | "deleteWordPressImportBatch"
  | "saveWordPressImportFile"
  | "listWordPressImportFiles"
  | "listExpiredWordPressImportFiles"
  | "deleteWordPressImportFile"
  | "saveWordPressImportItem"
  | "listWordPressImportItems"
  | "saveWordPressImportMapping"
  | "getWordPressImportMapping"
  | "listWordPressImportMappings"
  | "saveWordPressImportMedia"
  | "listWordPressImportMedia"
  | "appendWordPressImportEvent"
  | "listWordPressImportEvents"
>;

type WordPressImportStorageContext = {
  ensureReady(): Promise<void>;
  queryAll<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T[]>;
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
};

export function createWordPressImportStorageDomain(
  context: WordPressImportStorageContext,
): WordPressImportStorageDomain {
  return {
    async listWordPressImportBatches(options?: {
      limit?: number;
    }): Promise<WordPressImportBatch[]> {
      await context.ensureReady();
      const limit = Math.max(1, Math.min(options?.limit ?? 20, 100));
      const rows = await context.queryAll<Record<string, unknown>>(
        `SELECT * FROM aria_wp_import_batches WHERE source_type = 'wxr' ORDER BY created_at DESC LIMIT ?`,
        [limit],
      );
      return rows.map((row) => mapWordPressImportBatchRow(row));
    },

    async getWordPressImportBatch(
      id: string,
    ): Promise<WordPressImportBatch | null> {
      await context.ensureReady();
      const row = await context.queryFirst<Record<string, unknown>>(
        `SELECT * FROM aria_wp_import_batches WHERE id = ? LIMIT 1`,
        [id],
      );
      return row ? mapWordPressImportBatchRow(row) : null;
    },

    async saveWordPressImportBatch(
      batch: WordPressImportBatch,
    ): Promise<WordPressImportBatch> {
      await context.ensureReady();
      await context.run(
        `INSERT INTO aria_wp_import_batches (
          id, source_type, source_site_url, source_home_url, source_wp_version,
          table_prefix, multisite_blog_id, mode, status, current_phase,
          current_message, progress_percent, default_entry_status, media_mode,
          counts_json, summary_json, error_message, actor_id, created_at,
          updated_at, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_type = excluded.source_type,
          source_site_url = excluded.source_site_url,
          source_home_url = excluded.source_home_url,
          source_wp_version = excluded.source_wp_version,
          table_prefix = excluded.table_prefix,
          multisite_blog_id = excluded.multisite_blog_id,
          mode = excluded.mode,
          status = excluded.status,
          current_phase = excluded.current_phase,
          current_message = excluded.current_message,
          progress_percent = excluded.progress_percent,
          default_entry_status = excluded.default_entry_status,
          media_mode = excluded.media_mode,
          counts_json = excluded.counts_json,
          summary_json = excluded.summary_json,
          error_message = excluded.error_message,
          actor_id = excluded.actor_id,
          updated_at = excluded.updated_at,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at`,
        [
          batch.id,
          batch.sourceType,
          batch.sourceSiteUrl,
          batch.sourceHomeUrl,
          batch.sourceWpVersion,
          batch.tablePrefix,
          batch.multisiteBlogId,
          batch.mode,
          batch.status,
          batch.currentPhase,
          batch.currentMessage,
          batch.progressPercent,
          batch.defaultEntryStatus,
          batch.mediaMode,
          JSON.stringify(batch.counts),
          JSON.stringify(batch.summary),
          batch.errorMessage,
          batch.actorId,
          batch.createdAt,
          batch.updatedAt,
          batch.startedAt,
          batch.completedAt,
        ],
      );
      return batch;
    },

    async deleteWordPressImportBatch(id: string): Promise<void> {
      await context.ensureReady();
      await context.run(`DELETE FROM aria_wp_import_batches WHERE id = ?`, [
        id,
      ]);
    },

    async saveWordPressImportFile(
      file: WordPressImportFile,
    ): Promise<WordPressImportFile> {
      await context.ensureReady();
      await context.run(
        `INSERT INTO aria_wp_import_files (
          id, batch_id, filename, object_key, content_type, size_bytes, sha256,
          retention_expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          filename = excluded.filename,
          object_key = excluded.object_key,
          content_type = excluded.content_type,
          size_bytes = excluded.size_bytes,
          sha256 = excluded.sha256,
          retention_expires_at = excluded.retention_expires_at`,
        [
          file.id,
          file.batchId,
          file.filename,
          file.objectKey,
          file.contentType,
          file.sizeBytes,
          file.sha256,
          file.retentionExpiresAt,
          file.createdAt,
        ],
      );
      return file;
    },

    async listWordPressImportFiles(
      batchId: string,
    ): Promise<WordPressImportFile[]> {
      await context.ensureReady();
      const rows = await context.queryAll<Record<string, unknown>>(
        `SELECT * FROM aria_wp_import_files WHERE batch_id = ? ORDER BY created_at ASC`,
        [batchId],
      );
      return rows.map((row) => mapWordPressImportFileRow(row));
    },

    async listExpiredWordPressImportFiles(
      nowIso: string,
    ): Promise<WordPressImportFile[]> {
      await context.ensureReady();
      const rows = await context.queryAll<Record<string, unknown>>(
        `SELECT * FROM aria_wp_import_files WHERE retention_expires_at <= ? ORDER BY retention_expires_at ASC`,
        [nowIso],
      );
      return rows.map((row) => mapWordPressImportFileRow(row));
    },

    async deleteWordPressImportFile(id: string): Promise<void> {
      await context.ensureReady();
      await context.run(`DELETE FROM aria_wp_import_files WHERE id = ?`, [id]);
    },

    async saveWordPressImportItem(
      item: WordPressImportItem,
    ): Promise<WordPressImportItem> {
      await context.ensureReady();
      await context.run(
        `INSERT INTO aria_wp_import_items (
          id, batch_id, source_kind, source_id, source_parent_id, source_label,
          target_type, target_id, action, status, source_checksum, skip_reason,
          diagnostics_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          target_type = excluded.target_type,
          target_id = excluded.target_id,
          action = excluded.action,
          status = excluded.status,
          source_checksum = excluded.source_checksum,
          skip_reason = excluded.skip_reason,
          diagnostics_json = excluded.diagnostics_json,
          updated_at = excluded.updated_at`,
        [
          item.id,
          item.batchId,
          item.sourceKind,
          item.sourceId,
          item.sourceParentId,
          item.sourceLabel,
          item.targetType,
          item.targetId,
          item.action,
          item.status,
          item.sourceChecksum,
          item.skipReason,
          JSON.stringify(item.diagnostics),
          item.createdAt,
          item.updatedAt,
        ],
      );
      return item;
    },

    async listWordPressImportItems(
      batchId: string,
    ): Promise<WordPressImportItem[]> {
      await context.ensureReady();
      const rows = await context.queryAll<Record<string, unknown>>(
        `SELECT * FROM aria_wp_import_items WHERE batch_id = ? ORDER BY created_at ASC`,
        [batchId],
      );
      return rows.map((row) => mapWordPressImportItemRow(row));
    },

    async saveWordPressImportMapping(
      mapping: WordPressImportMapping,
    ): Promise<WordPressImportMapping> {
      await context.ensureReady();
      await context.run(
        `INSERT INTO aria_wp_import_mappings (
          id, source_site_hash, source_kind, source_id, target_type, target_id,
          source_checksum, last_batch_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_site_hash, source_kind, source_id) DO UPDATE SET
          target_type = excluded.target_type,
          target_id = excluded.target_id,
          source_checksum = excluded.source_checksum,
          last_batch_id = excluded.last_batch_id,
          updated_at = excluded.updated_at`,
        [
          mapping.id,
          mapping.sourceSiteHash,
          mapping.sourceKind,
          mapping.sourceId,
          mapping.targetType,
          mapping.targetId,
          mapping.sourceChecksum,
          mapping.lastBatchId,
          mapping.createdAt,
          mapping.updatedAt,
        ],
      );
      return mapping;
    },

    async getWordPressImportMapping(options: {
      sourceSiteHash: string;
      sourceKind: string;
      sourceId: string;
    }): Promise<WordPressImportMapping | null> {
      await context.ensureReady();
      const row = await context.queryFirst<Record<string, unknown>>(
        `SELECT * FROM aria_wp_import_mappings
        WHERE source_site_hash = ? AND source_kind = ? AND source_id = ?
        LIMIT 1`,
        [options.sourceSiteHash, options.sourceKind, options.sourceId],
      );
      return row ? mapWordPressImportMappingRow(row) : null;
    },

    async listWordPressImportMappings(
      batchId: string,
    ): Promise<WordPressImportMapping[]> {
      await context.ensureReady();
      const rows = await context.queryAll<Record<string, unknown>>(
        `SELECT * FROM aria_wp_import_mappings WHERE last_batch_id = ? ORDER BY updated_at ASC`,
        [batchId],
      );
      return rows.map((row) => mapWordPressImportMappingRow(row));
    },

    async saveWordPressImportMedia(
      media: WordPressImportMedia,
    ): Promise<WordPressImportMedia> {
      await context.ensureReady();
      await context.run(
        `INSERT INTO aria_wp_import_media (
          id, batch_id, source_attachment_id, source_url, target_media_path,
          target_media_id, status, content_type, size_bytes, sha256, alt,
          caption, error_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          target_media_path = excluded.target_media_path,
          target_media_id = excluded.target_media_id,
          status = excluded.status,
          content_type = excluded.content_type,
          size_bytes = excluded.size_bytes,
          sha256 = excluded.sha256,
          alt = excluded.alt,
          caption = excluded.caption,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at`,
        [
          media.id,
          media.batchId,
          media.sourceAttachmentId,
          media.sourceUrl,
          media.targetMediaPath,
          media.targetMediaId,
          media.status,
          media.contentType,
          media.sizeBytes,
          media.sha256,
          media.alt,
          media.caption,
          media.errorMessage,
          media.createdAt,
          media.updatedAt,
        ],
      );
      return media;
    },

    async listWordPressImportMedia(
      batchId: string,
    ): Promise<WordPressImportMedia[]> {
      await context.ensureReady();
      const rows = await context.queryAll<Record<string, unknown>>(
        `SELECT * FROM aria_wp_import_media WHERE batch_id = ? ORDER BY created_at ASC`,
        [batchId],
      );
      return rows.map((row) => mapWordPressImportMediaRow(row));
    },

    async appendWordPressImportEvent(
      event: WordPressImportEvent,
    ): Promise<WordPressImportEvent> {
      await context.ensureReady();
      await context.run(
        `INSERT INTO aria_wp_import_events (
          id, batch_id, phase, level, message, completed_count, total_count,
          payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.batchId,
          event.phase,
          event.level,
          event.message,
          event.completedCount,
          event.totalCount,
          event.payload ? JSON.stringify(event.payload) : null,
          event.createdAt,
        ],
      );
      return event;
    },

    async listWordPressImportEvents(
      batchId: string,
    ): Promise<WordPressImportEvent[]> {
      await context.ensureReady();
      const rows = await context.queryAll<Record<string, unknown>>(
        `SELECT * FROM aria_wp_import_events WHERE batch_id = ? ORDER BY created_at ASC`,
        [batchId],
      );
      return rows.map((row) => mapWordPressImportEventRow(row));
    },
  };
}
