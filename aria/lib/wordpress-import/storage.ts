import { z } from "zod";
import {
  WordPressImportBatchSchema,
  WordPressImportEventSchema,
  WordPressImportFileSchema,
  WordPressImportItemSchema,
  WordPressImportMappingSchema,
  WordPressImportMediaSchema,
  WordPressImportCountsSchema,
  WordPressImportSummarySchema,
  type WordPressImportBatch,
  type WordPressImportEvent,
  type WordPressImportFile,
  type WordPressImportItem,
  type WordPressImportMapping,
  type WordPressImportMedia,
} from "./schemas";

export const WORDPRESS_IMPORT_STORAGE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS aria_wp_import_batches (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('wxr')),
    source_site_url TEXT,
    source_home_url TEXT,
    source_wp_version TEXT,
    table_prefix TEXT,
    multisite_blog_id TEXT,
    mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
    status TEXT NOT NULL CHECK (
      status IN ('uploaded', 'analyzing', 'planned', 'applying', 'completed', 'failed', 'cancelled')
    ),
    current_phase TEXT CHECK (
      current_phase IS NULL OR current_phase IN (
        'uploading',
        'reading-source',
        'detecting-settings',
        'importing-users',
        'creating-collections',
        'importing-posts',
        'importing-pages',
        'importing-custom-post-types',
        'importing-taxonomies',
        'importing-media',
        'importing-comments',
        'creating-menus',
        'mapping-seo',
        'creating-redirects',
        'finalizing-report',
        'complete',
        'failed'
      )
    ),
    current_message TEXT,
    progress_percent REAL NOT NULL DEFAULT 0,
    default_entry_status TEXT NOT NULL DEFAULT 'draft' CHECK (
      default_entry_status IN ('draft', 'published', 'archived')
    ),
    media_mode TEXT NOT NULL DEFAULT 'download' CHECK (
      media_mode IN ('download', 'reference', 'skip')
    ),
    counts_json TEXT NOT NULL DEFAULT '{}',
    summary_json TEXT NOT NULL DEFAULT '{}',
    error_message TEXT,
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_aria_wp_import_batches_status_created
    ON aria_wp_import_batches(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_wp_import_batches_source_site_created
    ON aria_wp_import_batches(source_site_url, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS aria_wp_import_files (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    object_key TEXT NOT NULL,
    content_type TEXT,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    retention_expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES aria_wp_import_batches(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_aria_wp_import_files_batch
    ON aria_wp_import_files(batch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_wp_import_files_retention
    ON aria_wp_import_files(retention_expires_at)`,

  `CREATE TABLE IF NOT EXISTS aria_wp_import_items (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_parent_id TEXT,
    source_label TEXT,
    target_type TEXT,
    target_id TEXT,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'skip', 'fail')),
    status TEXT NOT NULL CHECK (status IN ('planned', 'imported', 'skipped', 'failed')),
    source_checksum TEXT,
    skip_reason TEXT,
    diagnostics_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES aria_wp_import_batches(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_aria_wp_import_items_batch_status
    ON aria_wp_import_items(batch_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_wp_import_items_source
    ON aria_wp_import_items(batch_id, source_kind, source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_wp_import_items_target
    ON aria_wp_import_items(target_type, target_id)`,

  `CREATE TABLE IF NOT EXISTS aria_wp_import_mappings (
    id TEXT PRIMARY KEY,
    source_site_hash TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    source_checksum TEXT,
    last_batch_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_wp_import_mappings_source
    ON aria_wp_import_mappings(source_site_hash, source_kind, source_id)`,

  `CREATE TABLE IF NOT EXISTS aria_wp_import_media (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    source_attachment_id TEXT,
    source_url TEXT NOT NULL,
    target_media_path TEXT,
    target_media_id TEXT,
    status TEXT NOT NULL CHECK (
      status IN ('planned', 'downloaded', 'referenced', 'skipped', 'failed')
    ),
    content_type TEXT,
    size_bytes INTEGER,
    sha256 TEXT,
    alt TEXT,
    caption TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES aria_wp_import_batches(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_aria_wp_import_media_batch_status
    ON aria_wp_import_media(batch_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_wp_import_media_attachment
    ON aria_wp_import_media(source_attachment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_wp_import_media_url
    ON aria_wp_import_media(source_url)`,

  `CREATE TABLE IF NOT EXISTS aria_wp_import_events (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (
      phase IN (
        'uploading',
        'reading-source',
        'detecting-settings',
        'importing-users',
        'creating-collections',
        'importing-posts',
        'importing-pages',
        'importing-custom-post-types',
        'importing-taxonomies',
        'importing-media',
        'importing-comments',
        'creating-menus',
        'mapping-seo',
        'creating-redirects',
        'finalizing-report',
        'complete',
        'failed'
      )
    ),
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    message TEXT NOT NULL,
    completed_count INTEGER,
    total_count INTEGER,
    payload_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES aria_wp_import_batches(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_aria_wp_import_events_batch_created
    ON aria_wp_import_events(batch_id, created_at ASC)`,
] as const;

const BatchRowSchema = z
  .looseObject({
    id: z.string(),
    source_type: z.string(),
    source_site_url: z.string().nullable(),
    source_home_url: z.string().nullable(),
    source_wp_version: z.string().nullable(),
    table_prefix: z.string().nullable(),
    multisite_blog_id: z.string().nullable(),
    mode: z.string(),
    status: z.string(),
    current_phase: z.string().nullable(),
    current_message: z.string().nullable(),
    progress_percent: z.coerce.number(),
    default_entry_status: z.string(),
    media_mode: z.string(),
    counts_json: z.string(),
    summary_json: z.string(),
    error_message: z.string().nullable(),
    actor_id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
  });

const FileRowSchema = z
  .looseObject({
    id: z.string(),
    batch_id: z.string(),
    filename: z.string(),
    object_key: z.string(),
    content_type: z.string().nullable(),
    size_bytes: z.coerce.number(),
    sha256: z.string(),
    retention_expires_at: z.string(),
    created_at: z.string(),
  });

const ItemRowSchema = z
  .looseObject({
    id: z.string(),
    batch_id: z.string(),
    source_kind: z.string(),
    source_id: z.string(),
    source_parent_id: z.string().nullable(),
    source_label: z.string().nullable(),
    target_type: z.string().nullable(),
    target_id: z.string().nullable(),
    action: z.string(),
    status: z.string(),
    source_checksum: z.string().nullable(),
    skip_reason: z.string().nullable(),
    diagnostics_json: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  });

const MediaRowSchema = z
  .looseObject({
    id: z.string(),
    batch_id: z.string(),
    source_attachment_id: z.string().nullable(),
    source_url: z.string(),
    target_media_path: z.string().nullable(),
    target_media_id: z.string().nullable(),
    status: z.string(),
    content_type: z.string().nullable(),
    size_bytes: z.coerce.number().nullable(),
    sha256: z.string().nullable(),
    alt: z.string().nullable(),
    caption: z.string().nullable(),
    error_message: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  });

const MappingRowSchema = z
  .looseObject({
    id: z.string(),
    source_site_hash: z.string(),
    source_kind: z.string(),
    source_id: z.string(),
    target_type: z.string(),
    target_id: z.string(),
    source_checksum: z.string().nullable(),
    last_batch_id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  });

const EventRowSchema = z
  .looseObject({
    id: z.string(),
    batch_id: z.string(),
    phase: z.string(),
    level: z.string(),
    message: z.string(),
    completed_count: z.coerce.number().nullable(),
    total_count: z.coerce.number().nullable(),
    payload_json: z.string().nullable(),
    created_at: z.string(),
  });

function parseJsonRecord<T>(value: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(value) as unknown);
  } catch {
    return schema.parse({});
  }
}

function parseOptionalPayload(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    return z.record(z.string(), z.unknown()).parse(JSON.parse(value));
  } catch {
    return null;
  }
}

export function mapWordPressImportBatchRow(row: unknown): WordPressImportBatch {
  const parsed = BatchRowSchema.parse(row);
  return WordPressImportBatchSchema.parse({
    id: parsed.id,
    sourceType: parsed.source_type,
    sourceSiteUrl: parsed.source_site_url,
    sourceHomeUrl: parsed.source_home_url,
    sourceWpVersion: parsed.source_wp_version,
    tablePrefix: parsed.table_prefix,
    multisiteBlogId: parsed.multisite_blog_id,
    mode: parsed.mode,
    status: parsed.status,
    currentPhase: parsed.current_phase,
    currentMessage: parsed.current_message,
    progressPercent: parsed.progress_percent,
    defaultEntryStatus: parsed.default_entry_status,
    mediaMode: parsed.media_mode,
    counts: parseJsonRecord(parsed.counts_json, WordPressImportCountsSchema),
    summary: parseJsonRecord(parsed.summary_json, WordPressImportSummarySchema),
    errorMessage: parsed.error_message,
    actorId: parsed.actor_id,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
    startedAt: parsed.started_at,
    completedAt: parsed.completed_at,
  });
}

export function mapWordPressImportFileRow(row: unknown): WordPressImportFile {
  const parsed = FileRowSchema.parse(row);
  return WordPressImportFileSchema.parse({
    id: parsed.id,
    batchId: parsed.batch_id,
    filename: parsed.filename,
    objectKey: parsed.object_key,
    contentType: parsed.content_type,
    sizeBytes: parsed.size_bytes,
    sha256: parsed.sha256,
    retentionExpiresAt: parsed.retention_expires_at,
    createdAt: parsed.created_at,
  });
}

export function mapWordPressImportItemRow(row: unknown): WordPressImportItem {
  const parsed = ItemRowSchema.parse(row);
  return WordPressImportItemSchema.parse({
    id: parsed.id,
    batchId: parsed.batch_id,
    sourceKind: parsed.source_kind,
    sourceId: parsed.source_id,
    sourceParentId: parsed.source_parent_id,
    sourceLabel: parsed.source_label,
    targetType: parsed.target_type,
    targetId: parsed.target_id,
    action: parsed.action,
    status: parsed.status,
    sourceChecksum: parsed.source_checksum,
    skipReason: parsed.skip_reason,
    diagnostics: parseOptionalPayload(parsed.diagnostics_json) ?? {},
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  });
}

export function mapWordPressImportMediaRow(row: unknown): WordPressImportMedia {
  const parsed = MediaRowSchema.parse(row);
  return WordPressImportMediaSchema.parse({
    id: parsed.id,
    batchId: parsed.batch_id,
    sourceAttachmentId: parsed.source_attachment_id,
    sourceUrl: parsed.source_url,
    targetMediaPath: parsed.target_media_path,
    targetMediaId: parsed.target_media_id,
    status: parsed.status,
    contentType: parsed.content_type,
    sizeBytes: parsed.size_bytes,
    sha256: parsed.sha256,
    alt: parsed.alt,
    caption: parsed.caption,
    errorMessage: parsed.error_message,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  });
}

export function mapWordPressImportMappingRow(
  row: unknown,
): WordPressImportMapping {
  const parsed = MappingRowSchema.parse(row);
  return WordPressImportMappingSchema.parse({
    id: parsed.id,
    sourceSiteHash: parsed.source_site_hash,
    sourceKind: parsed.source_kind,
    sourceId: parsed.source_id,
    targetType: parsed.target_type,
    targetId: parsed.target_id,
    sourceChecksum: parsed.source_checksum,
    lastBatchId: parsed.last_batch_id,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  });
}

export function mapWordPressImportEventRow(row: unknown): WordPressImportEvent {
  const parsed = EventRowSchema.parse(row);
  return WordPressImportEventSchema.parse({
    id: parsed.id,
    batchId: parsed.batch_id,
    phase: parsed.phase,
    level: parsed.level,
    message: parsed.message,
    completedCount: parsed.completed_count,
    totalCount: parsed.total_count,
    payload: parseOptionalPayload(parsed.payload_json),
    createdAt: parsed.created_at,
  });
}
