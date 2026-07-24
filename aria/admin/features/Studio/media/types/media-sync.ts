import { z } from "zod";

export type SyncDirection = "push" | "pull";
export type ConflictPolicy =
  | "local-wins"
  | "remote-wins"
  | "newest-wins"
  | "manual";

export const SyncSummarySchema = z.object({
  total: z.int().nonnegative(),
  created: z.int().nonnegative(),
  updated: z.int().nonnegative(),
  deleted: z.int().nonnegative(),
  skipped: z.int().nonnegative(),
  conflicted: z.int().nonnegative(),
  failed: z.int().nonnegative().default(0),
});

export const SyncPlanItemSchema = z.object({
  logicalPath: z.string().min(1),
  action: z.enum(["create", "update", "delete", "skip", "conflict"]),
  reason: z.string().min(1),
  sourceSizeBytes: z.int().nonnegative().optional(),
  targetSizeBytes: z.int().nonnegative().optional(),
});

export const SyncPlanSchema = z.object({
  sourceEndpointId: z.string().min(1),
  targetEndpointId: z.string().min(1),
  direction: z.enum(["push", "pull"]),
  conflictPolicy: z.enum([
    "local-wins",
    "remote-wins",
    "newest-wins",
    "manual",
  ]),
  includeDeletes: z.boolean(),
  items: z.array(SyncPlanItemSchema),
  summary: SyncSummarySchema,
});

export const SyncPlanResponseSchema = z.object({
  success: z.literal(true),
  mode: z.literal("dry-run"),
  jobId: z.string().min(1),
  plan: SyncPlanSchema,
});

export const SyncHistoryJobSchema = z.object({
  id: z.string().min(1),
  planJobId: z.string().min(1).optional(),
  mode: z.enum(["dry-run", "apply"]),
  status: z.enum(["pending", "running", "completed", "failed", "canceled"]),
  direction: z.enum(["push", "pull"]),
  sourceEndpointId: z.string().min(1),
  targetEndpointId: z.string().min(1),
  conflictPolicy: z.enum([
    "local-wins",
    "remote-wins",
    "newest-wins",
    "manual",
  ]),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  summary: SyncSummarySchema,
});

export const SyncHistoryResponseSchema = z.object({
  success: z.literal(true),
  mode: z.enum(["dry-run", "apply"]),
  lastSync: SyncHistoryJobSchema.optional(),
  jobs: z.array(SyncHistoryJobSchema),
});

export const SyncApplyResponseSchema = z.object({
  success: z.literal(true),
  idempotentReplay: z.boolean(),
  applyJobId: z.string().min(1),
  planJobId: z.string().min(1),
  status: z.enum(["pending", "running", "completed", "failed", "canceled"]),
  summary: SyncSummarySchema,
});

export type SyncPlan = z.infer<typeof SyncPlanSchema>;
export type SyncHistoryJob = z.infer<typeof SyncHistoryJobSchema>;
export type SyncAction = z.infer<typeof SyncPlanItemSchema>["action"];
