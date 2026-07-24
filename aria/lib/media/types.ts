import { z } from "astro/zod";

export const MediaEndpointKindSchema = z.enum([
  "local",
  "cloudflare-r2",
  "netlify",
  "s3",
  "custom",
]);
export type MediaEndpointKind = z.infer<typeof MediaEndpointKindSchema>;

export const SyncDirectionSchema = z.enum(["push", "pull"]);
export type SyncDirection = z.infer<typeof SyncDirectionSchema>;

export const ConflictPolicySchema = z.enum([
  "local-wins",
  "remote-wins",
  "newest-wins",
  "manual",
]);
export type ConflictPolicy = z.infer<typeof ConflictPolicySchema>;

export const MediaPlanActionSchema = z.enum([
  "create",
  "update",
  "delete",
  "skip",
  "conflict",
]);
export type MediaPlanAction = z.infer<typeof MediaPlanActionSchema>;

export const MediaSyncModeSchema = z.enum(["dry-run", "apply"]);
export type MediaSyncMode = z.infer<typeof MediaSyncModeSchema>;

export const MediaSyncJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "canceled",
]);
export type MediaSyncJobStatus = z.infer<typeof MediaSyncJobStatusSchema>;

export const MediaSyncItemResultStatusSchema = z.enum([
  "planned",
  "applied",
  "failed",
  "skipped",
]);
export type MediaSyncItemResultStatus = z.infer<
  typeof MediaSyncItemResultStatusSchema
>;

export const MediaObjectRefSchema = z.object({
  key: z.string().min(1),
  url: z.string().optional(),
  sizeBytes: z.int().nonnegative().optional(),
  mimeType: z.string().optional(),
  etag: z.string().optional(),
  versionId: z.string().optional(),
  checksumSha256: z.string().length(64).optional(),
  updatedAt: z.string().optional(),
});
export type MediaObjectRef = z.infer<typeof MediaObjectRefSchema>;

export const MediaListOptionsSchema = z.object({
  prefix: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.int().positive().max(5000).optional(),
});
export type MediaListOptions = z.infer<typeof MediaListOptionsSchema>;

export const MediaListResultSchema = z.object({
  objects: z.array(MediaObjectRefSchema),
  nextCursor: z.string().optional(),
});
export type MediaListResult = z.infer<typeof MediaListResultSchema>;

export const MediaSyncCapabilitiesSchema = z.object({
  batchPut: z.boolean().optional(),
  batchDelete: z.boolean().optional(),
  checksum: z.boolean().optional(),
  etag: z.boolean().optional(),
  versioning: z.boolean().optional(),
  signedUrlRead: z.boolean().optional(),
  signedUrlWrite: z.boolean().optional(),
});
export type MediaSyncCapabilities = z.infer<typeof MediaSyncCapabilitiesSchema>;

export interface MediaEndpoint {
  readonly id: string;
  readonly kind: MediaEndpointKind;
  capabilities(): Promise<MediaSyncCapabilities>;
  list(options?: MediaListOptions): Promise<MediaListResult>;
  head(key: string): Promise<MediaObjectRef | null>;
  get(key: string): Promise<Buffer | null>;
  put(
    key: string,
    data: Buffer,
    meta?: { mimeType?: string },
  ): Promise<MediaObjectRef>;
  delete(key: string): Promise<void>;
}

export const MediaSyncPlanItemSchema = z.object({
  logicalPath: z.string().min(1),
  action: MediaPlanActionSchema,
  reason: z.string().min(1),
  sourceChecksum: z.string().length(64).optional(),
  targetChecksum: z.string().length(64).optional(),
  sourceEtag: z.string().optional(),
  targetEtag: z.string().optional(),
  sourceSizeBytes: z.int().nonnegative().optional(),
  targetSizeBytes: z.int().nonnegative().optional(),
});
export type MediaSyncPlanItem = z.infer<typeof MediaSyncPlanItemSchema>;

export const MediaSyncSummarySchema = z.object({
  total: z.int().nonnegative(),
  created: z.int().nonnegative(),
  updated: z.int().nonnegative(),
  deleted: z.int().nonnegative(),
  skipped: z.int().nonnegative(),
  conflicted: z.int().nonnegative(),
});
export type MediaSyncSummary = z.infer<typeof MediaSyncSummarySchema>;

export const MediaSyncPlanSchema = z.object({
  sourceEndpointId: z.string().min(1),
  targetEndpointId: z.string().min(1),
  direction: SyncDirectionSchema,
  conflictPolicy: ConflictPolicySchema,
  includeDeletes: z.boolean(),
  items: z.array(MediaSyncPlanItemSchema),
  summary: MediaSyncSummarySchema,
});
export type MediaSyncPlan = z.infer<typeof MediaSyncPlanSchema>;

export const MediaSyncPlanInputSchema = z.object({
  direction: SyncDirectionSchema,
  conflictPolicy: ConflictPolicySchema.default("newest-wins"),
  includeDeletes: z.boolean().default(false),
  sourceEndpointId: z.string().min(1).optional(),
  targetEndpointId: z.string().min(1).optional(),
});
export type MediaSyncPlanInput = z.infer<typeof MediaSyncPlanInputSchema>;

export const MediaSyncApplyInputSchema = z.object({
  jobId: z.string().min(1),
  idempotencyKey: z.uuid(),
});
export type MediaSyncApplyInput = z.infer<typeof MediaSyncApplyInputSchema>;

export const MediaSyncHistoryInputSchema = z.object({
  mode: MediaSyncModeSchema.default("apply"),
  limit: z.int().positive().max(50).default(10),
});
export type MediaSyncHistoryInput = z.infer<typeof MediaSyncHistoryInputSchema>;

export const MediaSyncHistorySummarySchema = z.object({
  total: z.int().nonnegative(),
  created: z.int().nonnegative(),
  updated: z.int().nonnegative(),
  deleted: z.int().nonnegative(),
  skipped: z.int().nonnegative(),
  conflicted: z.int().nonnegative(),
  failed: z.int().nonnegative(),
});
export type MediaSyncHistorySummary = z.infer<
  typeof MediaSyncHistorySummarySchema
>;

export const MediaSyncHistoryJobSchema = z.object({
  id: z.string().min(1),
  planJobId: z.string().min(1).optional(),
  mode: MediaSyncModeSchema,
  status: MediaSyncJobStatusSchema,
  direction: SyncDirectionSchema,
  sourceEndpointId: z.string().min(1),
  targetEndpointId: z.string().min(1),
  conflictPolicy: ConflictPolicySchema,
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  summary: MediaSyncHistorySummarySchema,
});
export type MediaSyncHistoryJob = z.infer<typeof MediaSyncHistoryJobSchema>;

export const MediaSyncHistoryResponseSchema = z.object({
  success: z.literal(true),
  mode: MediaSyncModeSchema,
  lastSync: MediaSyncHistoryJobSchema.optional(),
  jobs: z.array(MediaSyncHistoryJobSchema),
});
export type MediaSyncHistoryResponse = z.infer<
  typeof MediaSyncHistoryResponseSchema
>;
