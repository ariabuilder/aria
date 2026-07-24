import { z } from "zod";

export const WordPressImportSourceTypeSchema = z.enum(["wxr"]);
export type WordPressImportSourceType = z.infer<
  typeof WordPressImportSourceTypeSchema
>;

export const WordPressImportModeSchema = z.enum(["dry_run", "apply"]);
export type WordPressImportMode = z.infer<typeof WordPressImportModeSchema>;

export const WordPressImportBatchStatusSchema = z.enum([
  "uploaded",
  "analyzing",
  "planned",
  "applying",
  "completed",
  "failed",
  "cancelled",
]);
export type WordPressImportBatchStatus = z.infer<
  typeof WordPressImportBatchStatusSchema
>;

export const WordPressImportEntryStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);

export const WordPressImportMediaModeSchema = z.enum([
  "download",
  "reference",
  "skip",
]);

export const WordPressImportPhaseSchema = z.enum([
  "uploading",
  "reading-source",
  "detecting-settings",
  "importing-users",
  "creating-collections",
  "importing-posts",
  "importing-pages",
  "importing-custom-post-types",
  "importing-taxonomies",
  "importing-media",
  "importing-comments",
  "creating-menus",
  "mapping-seo",
  "creating-redirects",
  "finalizing-report",
  "complete",
  "failed",
]);
export type WordPressImportPhase = z.infer<typeof WordPressImportPhaseSchema>;

export const WordPressImportCountsSchema = z
  .object({
    posts: z.int().nonnegative().default(0),
    pages: z.int().nonnegative().default(0),
    customPostTypes: z.int().nonnegative().default(0),
    attachments: z.int().nonnegative().default(0),
    authors: z.int().nonnegative().default(0),
    comments: z.int().nonnegative().default(0),
    terms: z.int().nonnegative().default(0),
    menus: z.int().nonnegative().default(0),
    skippedBuilderItems: z.int().nonnegative().default(0),
    cleanCustomFields: z.int().nonnegative().default(0),
    seoFields: z.int().nonnegative().default(0),
  })
  .strict();
export type WordPressImportCounts = z.infer<
  typeof WordPressImportCountsSchema
>;

export const WordPressImportSummarySchema = z
  .object({
    imported: z.int().nonnegative().default(0),
    skipped: z.int().nonnegative().default(0),
    failed: z.int().nonnegative().default(0),
    warnings: z.array(z.string()).default([]),
    nextSteps: z.array(z.string()).default([]),
  })
  .strict();
export type WordPressImportSummary = z.infer<
  typeof WordPressImportSummarySchema
>;

export const WordPressImportBatchSchema = z
  .object({
    id: z.string().trim().min(1),
    sourceType: WordPressImportSourceTypeSchema,
    sourceSiteUrl: z.string().nullable(),
    sourceHomeUrl: z.string().nullable(),
    sourceWpVersion: z.string().nullable(),
    tablePrefix: z.string().nullable(),
    multisiteBlogId: z.string().nullable(),
    mode: WordPressImportModeSchema,
    status: WordPressImportBatchStatusSchema,
    currentPhase: WordPressImportPhaseSchema.nullable(),
    currentMessage: z.string().nullable(),
    progressPercent: z.number().min(0).max(100),
    defaultEntryStatus: WordPressImportEntryStatusSchema,
    mediaMode: WordPressImportMediaModeSchema,
    counts: WordPressImportCountsSchema,
    summary: WordPressImportSummarySchema,
    errorMessage: z.string().nullable(),
    actorId: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    updatedAt: z.string().trim().min(1),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
  })
  .strict();
export type WordPressImportBatch = z.infer<
  typeof WordPressImportBatchSchema
>;

export const WordPressImportFileSchema = z
  .object({
    id: z.string().trim().min(1),
    batchId: z.string().trim().min(1),
    filename: z.string().trim().min(1),
    objectKey: z.string().trim().min(1),
    contentType: z.string().nullable(),
    sizeBytes: z.int().nonnegative(),
    sha256: z.string().trim().min(1),
    retentionExpiresAt: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
  })
  .strict();
export type WordPressImportFile = z.infer<typeof WordPressImportFileSchema>;

export const WordPressImportItemSchema = z
  .object({
    id: z.string().trim().min(1),
    batchId: z.string().trim().min(1),
    sourceKind: z.string().trim().min(1),
    sourceId: z.string().trim().min(1),
    sourceParentId: z.string().nullable(),
    sourceLabel: z.string().nullable(),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    action: z.enum(["create", "update", "skip", "fail"]),
    status: z.enum(["planned", "imported", "skipped", "failed"]),
    sourceChecksum: z.string().nullable(),
    skipReason: z.string().nullable(),
    diagnostics: z.record(z.string(), z.unknown()).default({}),
    createdAt: z.string().trim().min(1),
    updatedAt: z.string().trim().min(1),
  })
  .strict();
export type WordPressImportItem = z.infer<typeof WordPressImportItemSchema>;

export const WordPressImportMediaSchema = z
  .object({
    id: z.string().trim().min(1),
    batchId: z.string().trim().min(1),
    sourceAttachmentId: z.string().nullable(),
    sourceUrl: z.string().trim().min(1),
    targetMediaPath: z.string().nullable(),
    targetMediaId: z.string().nullable(),
    status: z.enum(["planned", "downloaded", "referenced", "skipped", "failed"]),
    contentType: z.string().nullable(),
    sizeBytes: z.int().nonnegative().nullable(),
    sha256: z.string().nullable(),
    alt: z.string().nullable(),
    caption: z.string().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string().trim().min(1),
    updatedAt: z.string().trim().min(1),
  })
  .strict();
export type WordPressImportMedia = z.infer<typeof WordPressImportMediaSchema>;

export const WordPressImportMappingSchema = z
  .object({
    id: z.string().trim().min(1),
    sourceSiteHash: z.string().trim().min(1),
    sourceKind: z.string().trim().min(1),
    sourceId: z.string().trim().min(1),
    targetType: z.string().trim().min(1),
    targetId: z.string().trim().min(1),
    sourceChecksum: z.string().nullable(),
    lastBatchId: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    updatedAt: z.string().trim().min(1),
  })
  .strict();
export type WordPressImportMapping = z.infer<
  typeof WordPressImportMappingSchema
>;

export const WordPressImportEventSchema = z
  .object({
    id: z.string().trim().min(1),
    batchId: z.string().trim().min(1),
    phase: WordPressImportPhaseSchema,
    level: z.enum(["info", "warn", "error"]),
    message: z.string().trim().min(1),
    completedCount: z.int().nonnegative().nullable(),
    totalCount: z.int().nonnegative().nullable(),
    payload: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string().trim().min(1),
  })
  .strict();
export type WordPressImportEvent = z.infer<typeof WordPressImportEventSchema>;

export const WordPressImportReportSchema = z
  .object({
    batch: WordPressImportBatchSchema,
    items: z.array(WordPressImportItemSchema),
    media: z.array(WordPressImportMediaSchema),
    mappings: z.array(WordPressImportMappingSchema).default([]),
    events: z.array(WordPressImportEventSchema),
  })
  .strict();
export type WordPressImportReport = z.infer<
  typeof WordPressImportReportSchema
>;
