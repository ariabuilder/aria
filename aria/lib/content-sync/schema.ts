import { z } from "astro/zod";
import {
  ContentSiteStateSchema,
  type ContentMutationKind,
  type ContentSiteState,
} from "../storage/adapter";
import {
  ContentSyncStatusSchema,
  CONTENT_SCHEMA_VERSION,
  CONTENT_SITE_STATE_SCOPE,
  TouchContentRevisionInputSchema,
  type ParsedTouchContentRevisionInput,
} from "./types";

export {
  ContentSiteStateSchema,
  ContentSyncStatusSchema,
  TouchContentRevisionInputSchema,
  CONTENT_SCHEMA_VERSION,
  CONTENT_SITE_STATE_SCOPE,
  type ContentMutationKind,
  type ContentSiteState,
  type ParsedTouchContentRevisionInput,
};

export const ContentSyncDirectionSchema = z.enum(["push", "pull"]);
export type ContentSyncDirection = z.infer<typeof ContentSyncDirectionSchema>;

export const ContentSyncModeSchema = z.enum(["dry-run", "apply"]);
export type ContentSyncMode = z.infer<typeof ContentSyncModeSchema>;

export const ContentSyncConflictPolicySchema = z.enum([
  "manual",
  "newest-wins",
  "local-wins",
  "remote-wins",
]);
export type ContentSyncConflictPolicy = z.infer<
  typeof ContentSyncConflictPolicySchema
>;

export const ContentSyncJobStatusSchema = z.enum([
  "planned",
  "running",
  "completed",
  "failed",
  "canceled",
]);
export type ContentSyncJobStatus = z.infer<typeof ContentSyncJobStatusSchema>;

export const ContentSyncResourceTypeSchema = z.enum([
  "page",
  "page-locale",
  "layout",
  "layout-locale",
  "component",
  "styles",
  "site-settings",
  "cms-collection",
  "cms-entry",
  "order",
  "snapshot",
  "metadata",
]);
export type ContentSyncResourceType = z.infer<
  typeof ContentSyncResourceTypeSchema
>;

export const ContentSyncItemActionSchema = z.enum([
  "create",
  "update",
  "delete",
  "skip",
  "conflict",
]);
export type ContentSyncItemAction = z.infer<typeof ContentSyncItemActionSchema>;

export const ContentSyncItemResultStatusSchema = z.enum([
  "planned",
  "applied",
  "skipped",
  "conflicted",
  "failed",
]);
export type ContentSyncItemResultStatus = z.infer<
  typeof ContentSyncItemResultStatusSchema
>;

export const ContentSyncEndpointIdSchema = z.enum([
  "local-sqlite",
  "cloudflare-d1",
]);
export type ContentSyncEndpointId = z.infer<typeof ContentSyncEndpointIdSchema>;

export const ContentSyncSummarySchema = z.object({
  total: z.int().nonnegative(),
  created: z.int().nonnegative(),
  updated: z.int().nonnegative(),
  deleted: z.int().nonnegative(),
  skipped: z.int().nonnegative(),
  conflicted: z.int().nonnegative(),
  failed: z.int().nonnegative(),
});
export type ContentSyncSummary = z.infer<typeof ContentSyncSummarySchema>;

export const ContentSyncRevisionSnapshotSchema = z.object({
  scope: z.string().min(1).default(CONTENT_SITE_STATE_SCOPE),
  revisionId: z.string().min(1),
  revisionSeq: z.int().nonnegative(),
  updatedAt: z.string().min(1),
  updatedBy: z.string().min(1).optional(),
  lastMutationKind: z.string().min(1),
  lastMutationTarget: z.string().min(1).optional(),
  schemaVersion: z.string().min(1).optional(),
});
export type ContentSyncRevisionSnapshot = z.infer<
  typeof ContentSyncRevisionSnapshotSchema
>;

export const ContentSyncResourceStateSchema = z.object({
  resourceType: ContentSyncResourceTypeSchema,
  resourceId: z.string().min(1),
  resourceLabel: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  checksum: z.string().min(1).optional(),
  exists: z.boolean(),
  updatedAt: z.string().min(1).optional(),
});
export type ContentSyncResourceState = z.infer<
  typeof ContentSyncResourceStateSchema
>;

export const ContentSyncPlanItemSchema = z.object({
  resourceType: ContentSyncResourceTypeSchema,
  resourceId: z.string().min(1),
  resourceLabel: z.string().min(1).optional(),
  action: ContentSyncItemActionSchema,
  reason: z.string().min(1),
  localVersion: z.string().min(1).optional(),
  remoteVersion: z.string().min(1).optional(),
  localChecksum: z.string().min(1).optional(),
  remoteChecksum: z.string().min(1).optional(),
});
export type ContentSyncPlanItem = z.infer<typeof ContentSyncPlanItemSchema>;

export const ContentSyncPlanSchema = z.object({
  direction: ContentSyncDirectionSchema,
  mode: ContentSyncModeSchema.default("dry-run"),
  sourceEndpointId: ContentSyncEndpointIdSchema,
  targetEndpointId: ContentSyncEndpointIdSchema,
  conflictPolicy: ContentSyncConflictPolicySchema,
  localRevision: ContentSyncRevisionSnapshotSchema.nullable(),
  remoteRevision: ContentSyncRevisionSnapshotSchema.nullable(),
  items: z.array(ContentSyncPlanItemSchema),
  summary: ContentSyncSummarySchema,
  generatedAt: z.string().min(1),
});
export type ContentSyncPlan = z.infer<typeof ContentSyncPlanSchema>;

export const ContentSyncPlanInputSchema = z.object({
  direction: ContentSyncDirectionSchema,
  conflictPolicy: ContentSyncConflictPolicySchema.default("newest-wins"),
  sourceEndpointId: ContentSyncEndpointIdSchema.optional(),
  targetEndpointId: ContentSyncEndpointIdSchema.optional(),
});
export type ContentSyncPlanInput = z.infer<typeof ContentSyncPlanInputSchema>;

export const ContentSyncApplyInputSchema = z.object({
  jobId: z.string().min(1),
  idempotencyKey: z.uuid(),
  selectedItemKeys: z.array(z.string().min(1)).optional(),
});
export type ContentSyncApplyInput = z.infer<typeof ContentSyncApplyInputSchema>;

export const ContentSyncStatusInputSchema = z.object({
  localEndpointId: ContentSyncEndpointIdSchema.default("local-sqlite"),
  remoteEndpointId: ContentSyncEndpointIdSchema.default("cloudflare-d1"),
});
export type ContentSyncStatusInput = z.infer<
  typeof ContentSyncStatusInputSchema
>;

export const ContentSyncStatusDataSchema = z.object({
  status: ContentSyncStatusSchema,
  localEndpointId: ContentSyncEndpointIdSchema,
  remoteEndpointId: ContentSyncEndpointIdSchema,
  localRevision: ContentSyncRevisionSnapshotSchema.nullable(),
  remoteRevision: ContentSyncRevisionSnapshotSchema.nullable(),
  latestSuccessfulSync: z
    .object({
      jobId: z.string().min(1),
      direction: ContentSyncDirectionSchema,
      completedAt: z.string().min(1),
      localRevisionId: z.string().min(1).optional(),
      remoteRevisionId: z.string().min(1).optional(),
    })
    .nullable(),
  latestPlanJobId: z.string().min(1).optional(),
  latestApplyJobId: z.string().min(1).optional(),
  evaluatedAt: z.string().min(1),
});
export type ContentSyncStatusData = z.infer<typeof ContentSyncStatusDataSchema>;

export const ContentSyncStatusResponseSchema = z.object({
  success: z.literal(true),
  data: ContentSyncStatusDataSchema,
});
export type ContentSyncStatusResponse = z.infer<
  typeof ContentSyncStatusResponseSchema
>;

export const ContentSyncJobSchema = z.object({
  id: z.string().min(1),
  direction: ContentSyncDirectionSchema,
  mode: ContentSyncModeSchema,
  status: ContentSyncJobStatusSchema,
  sourceEndpointId: ContentSyncEndpointIdSchema,
  targetEndpointId: ContentSyncEndpointIdSchema,
  conflictPolicy: ContentSyncConflictPolicySchema,
  localRevisionId: z.string().min(1).optional(),
  remoteRevisionId: z.string().min(1).optional(),
  resultLocalRevisionId: z.string().min(1).optional(),
  resultRemoteRevisionId: z.string().min(1).optional(),
  summary: ContentSyncSummarySchema.optional(),
  createdBy: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  startedAt: z.string().min(1).optional(),
  finishedAt: z.string().min(1).optional(),
  planJobId: z.string().min(1).optional(),
  idempotencyKey: z.uuid().optional(),
  notes: z.string().optional(),
});
export type ContentSyncJob = z.infer<typeof ContentSyncJobSchema>;

export const ContentSyncHistoryItemSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  resourceType: ContentSyncResourceTypeSchema,
  resourceId: z.string().min(1),
  resourceLabel: z.string().min(1).optional(),
  action: ContentSyncItemActionSchema,
  localVersion: z.string().min(1).optional(),
  remoteVersion: z.string().min(1).optional(),
  localChecksum: z.string().min(1).optional(),
  remoteChecksum: z.string().min(1).optional(),
  resultStatus: ContentSyncItemResultStatusSchema,
  conflictReason: z.string().min(1).optional(),
  errorMessage: z.string().min(1).optional(),
  createdAt: z.string().min(1),
});
export type ContentSyncHistoryItem = z.infer<
  typeof ContentSyncHistoryItemSchema
>;

export const ContentSyncHistoryJobSchema = ContentSyncJobSchema.extend({
  items: z.array(ContentSyncHistoryItemSchema).optional(),
});
export type ContentSyncHistoryJob = z.infer<typeof ContentSyncHistoryJobSchema>;

export const ContentSyncHistoryInputSchema = z.object({
  mode: ContentSyncModeSchema.optional(),
  limit: z.int().positive().max(50).default(10),
});
export type ContentSyncHistoryInput = z.infer<
  typeof ContentSyncHistoryInputSchema
>;

export const ContentSyncHistoryResponseSchema = z.object({
  success: z.literal(true),
  mode: ContentSyncModeSchema.optional(),
  jobs: z.array(ContentSyncHistoryJobSchema),
});
export type ContentSyncHistoryResponse = z.infer<
  typeof ContentSyncHistoryResponseSchema
>;

export const ContentSyncActionErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});
export type ContentSyncActionError = z.infer<
  typeof ContentSyncActionErrorSchema
>;

export const ContentSyncActionFailureSchema = z.object({
  success: z.literal(false),
  error: ContentSyncActionErrorSchema,
});
export type ContentSyncActionFailure = z.infer<
  typeof ContentSyncActionFailureSchema
>;

export const ContentSyncPlanResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    data: z.object({
      job: ContentSyncJobSchema,
      plan: ContentSyncPlanSchema,
    }),
  }),
  ContentSyncActionFailureSchema,
]);
export type ContentSyncPlanResponse = z.infer<
  typeof ContentSyncPlanResponseSchema
>;

export const ContentSyncApplyResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    data: z.object({
      job: ContentSyncJobSchema,
      items: z.array(ContentSyncHistoryItemSchema),
      summary: ContentSyncSummarySchema,
      localRevision: ContentSyncRevisionSnapshotSchema.nullable(),
      remoteRevision: ContentSyncRevisionSnapshotSchema.nullable(),
    }),
  }),
  ContentSyncActionFailureSchema,
]);
export type ContentSyncApplyResponse = z.infer<
  typeof ContentSyncApplyResponseSchema
>;

export function createEmptyContentSyncSummary(): ContentSyncSummary {
  return {
    total: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    conflicted: 0,
    failed: 0,
  };
}

export function summarizeContentSyncPlanItems(
  items: readonly ContentSyncPlanItem[],
): ContentSyncSummary {
  const summary = createEmptyContentSyncSummary();

  for (const item of items) {
    summary.total += 1;

    switch (item.action) {
      case "create":
        summary.created += 1;
        break;
      case "update":
        summary.updated += 1;
        break;
      case "delete":
        summary.deleted += 1;
        break;
      case "skip":
        summary.skipped += 1;
        break;
      case "conflict":
        summary.conflicted += 1;
        break;
    }
  }

  return ContentSyncSummarySchema.parse(summary);
}

export function toContentSyncRevisionSnapshot(
  state: ContentSiteState | null,
): ContentSyncRevisionSnapshot | null {
  if (!state) {
    return null;
  }

  return ContentSyncRevisionSnapshotSchema.parse({
    scope: state.scope,
    revisionId: state.currentRevisionId,
    revisionSeq: state.revisionSeq,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
    lastMutationKind: state.lastMutationKind,
    lastMutationTarget: state.lastMutationTarget,
    schemaVersion: state.schemaVersion,
  });
}
