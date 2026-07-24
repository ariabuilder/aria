import { z } from "zod";
import type { $ZodIssue } from "zod/v4/core";
import {
ContentSyncApplyInputSchema,
ContentSyncHistoryInputSchema,
ContentSyncPlanInputSchema,
ContentSyncStatusInputSchema,
} from "../../../../../lib/content-sync/schema";
import { DeliveryListQuerySchema } from "../../../../../lib/email/types";
import {
CreateSiteExportInputSchema,
DeleteSiteExportInputSchema,
} from "../../../../../lib/export/schema";
import {
SaveMediaAssetProfileInputSchema,
SaveMediaTransformVariantInputSchema,
} from "../../../../../lib/media/transforms/schemas";
import {
MediaSyncApplyInputSchema,
MediaSyncHistoryInputSchema,
MediaSyncPlanInputSchema,
} from "../../../../../lib/media/types";

export const ConfirmationCategorySchema = z.enum([
  "delete_content",
  "replace_variables",
  "publish",
  "bulk_operation",
]);
export type ConfirmationCategory = z.infer<typeof ConfirmationCategorySchema>;

export const AgentConfirmActionInputSchema = z
  .object({
    toolName: z.string().min(1),
    args: z.unknown().optional(),
    confirmationToken: z.string().min(1),
  })
  .strict();
export type AgentConfirmActionInput = z.infer<
  typeof AgentConfirmActionInputSchema
>;

export const AgentActivityLogListInputSchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.int().min(1).max(100).default(50),
    actor: z.string().optional(),
    transport: z.string().optional(),
    toolName: z.string().optional(),
    dateFrom: z.iso.datetime().optional(),
    dateTo: z.iso.datetime().optional(),
  })
  .strict();
export type AgentActivityLogListInput = z.infer<
  typeof AgentActivityLogListInputSchema
>;

export const AgentToolErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "NO_OPEN_DOCUMENT",
  "PLATFORM_UNAVAILABLE",
  "RATE_LIMITED",
  "CONFIRMATION_REQUIRED",
  "PROVIDER_ERROR",
  "INTERNAL",
]);

export type AgentToolErrorCode = z.infer<typeof AgentToolErrorCodeSchema>;

export const AgentToolErrorSchema = z
  .object({
    code: AgentToolErrorCodeSchema,
    message: z.string(),
    zodIssues: z.array(z.custom<$ZodIssue>()).optional(),
    suggestedFix: z.string().optional(),
    requiresConfirmation: z.boolean().optional(),
    confirmationToken: z.string().optional(),
    confirmationCategory: ConfirmationCategorySchema.optional(),
    retryAfterMs: z.int().positive().optional(),
  })
  .strict();

export type AgentToolError = z.infer<typeof AgentToolErrorSchema>;

export type AgentToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AgentToolError };

export const McpScopeSchema = z.enum([
  "mcp:read",
  "mcp:write",
  "mcp:design",
  "mcp:publish",
]);

export type McpScope = z.infer<typeof McpScopeSchema>;

export const McpTokenTypeSchema = z.enum(["personal", "service"]);
export type McpTokenType = z.infer<typeof McpTokenTypeSchema>;

export const McpTokenRecordSchema = z
  .object({
    id: z.uuid(),
    type: McpTokenTypeSchema,
    name: z.string().min(1).max(64),
    tokenHash: z.string(),
    tokenPrefix: z.string(),
    userId: z.uuid().nullable(),
    createdByUserId: z.uuid(),
    createdByUsername: z.string(),
    scopes: z.array(McpScopeSchema).min(1),
    expiresAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime().nullable(),
    revokedAt: z.iso.datetime().nullable(),
  })
  .strict();

export type McpTokenRecord = z.infer<typeof McpTokenRecordSchema>;

export const McpTokenListItemSchema = McpTokenRecordSchema.omit({
  tokenHash: true,
}).strict();

export type McpTokenListItem = z.infer<typeof McpTokenListItemSchema>;

export const CreateMcpTokenInputSchema = z
  .object({
    type: McpTokenTypeSchema.default("personal"),
    name: z.string().min(1).max(64),
    scopes: z.array(McpScopeSchema).min(1).default(["mcp:read"]),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict();

export type CreateMcpTokenInput = z.infer<typeof CreateMcpTokenInputSchema>;

export const CreateMcpTokenResponseSchema = z
  .object({
    token: z.string(),
    record: McpTokenListItemSchema,
  })
  .strict();

export const RevokeMcpTokenInputSchema = z
  .object({
    tokenId: z.uuid(),
  })
  .strict();

export const UpdateMcpTokenInputSchema = z
  .object({
    tokenId: z.uuid(),
    scopes: z.array(McpScopeSchema).min(1),
  })
  .strict();

export const AgentActivityLogSchema = z
  .object({
    id: z.uuid(),
    actor: z.string(),
    transport: z.string(),
    toolName: z.string(),
    resource: z.string().nullable(),
    status: z.enum(["success", "error"]),
    message: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export type AgentActivityLog = z.infer<typeof AgentActivityLogSchema>;

export const AgentActivityLogListOutputSchema = z
  .object({
    items: z.array(AgentActivityLogSchema),
    nextCursor: z.string().optional(),
  })
  .strict();
export type AgentActivityLogListOutput = z.infer<
  typeof AgentActivityLogListOutputSchema
>;

export const ContentReadTargetSchema = z.enum(["draft", "published"]);
export type ContentReadTarget = z.infer<typeof ContentReadTargetSchema>;

export const ContentReadDetailSchema = z.enum(["summary", "full", "seo"]);
export type ContentReadDetail = z.infer<typeof ContentReadDetailSchema>;

export const AriaListPagesInputSchema = z.object({}).strict();

export const AriaListPageVersionsInputSchema = z
  .object({ slug: z.string().min(1) })
  .strict();
export const AriaGetPageVersionInputSchema = z
  .object({
    slug: z.string().min(1),
    versionId: z.string().min(1),
  })
  .strict();

export const AriaSearchLibraryInputSchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    tier: z.enum(["free", "pro"]).optional(),
  })
  .strict();
export const AriaListInstalledLibraryPacksInputSchema = z.object({}).strict();
export const AriaCheckLibraryUpdatesInputSchema = z.object({}).strict();
export const AriaInstallLibraryPackInputSchema = z
  .object({
    packId: z.string().min(1),
    version: z.string().min(1).optional(),
    force: z.boolean().default(false),
  })
  .strict();
export const AriaInstallLibraryComponentInputSchema =
  AriaInstallLibraryPackInputSchema.extend({
    componentId: z.string().min(1),
  }).strict();
export const AriaUninstallLibraryPackInputSchema = z
  .object({
    packId: z.string().min(1),
    force: z.boolean().default(false),
  })
  .strict();
export const AriaCreateSiteExportInputSchema = CreateSiteExportInputSchema;
export const AriaDeleteSiteExportInputSchema = DeleteSiteExportInputSchema;
export const AriaListSiteExportsInputSchema = z.object({}).strict();
export const AriaGetLatestSiteExportInputSchema = z.object({}).strict();
export const AriaPlanContentSyncInputSchema = ContentSyncPlanInputSchema;
export const AriaApplyContentSyncInputSchema = ContentSyncApplyInputSchema;
export const AriaGetContentSyncStatusInputSchema = ContentSyncStatusInputSchema;
export const AriaListContentSyncHistoryInputSchema =
  ContentSyncHistoryInputSchema;
export const AriaGetMediaTransformStateInputSchema = z
  .object({ assetPath: z.string().min(1) })
  .strict();
export const AriaSaveMediaProfileInputSchema = SaveMediaAssetProfileInputSchema;
export const AriaSaveMediaTransformVariantInputSchema =
  SaveMediaTransformVariantInputSchema;
export const AriaDeleteMediaTransformVariantInputSchema = z
  .object({
    assetPath: z.string().min(1),
    id: z.string().min(1),
  })
  .strict();
export const AriaRebuildMediaUsageIndexInputSchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();
export const AriaListMediaSyncHistoryInputSchema = MediaSyncHistoryInputSchema;
export const AriaPlanMediaSyncInputSchema = MediaSyncPlanInputSchema;
export const AriaApplyMediaSyncInputSchema = MediaSyncApplyInputSchema;
export const AriaGetSystemStatusInputSchema = z.object({}).strict();
export const AriaGetCacheStatsInputSchema = z.object({}).strict();
export const AriaGetCacheObservabilityInputSchema = z.object({}).strict();
export const AriaListUsersInputSchema = z.object({}).strict();
export const AriaListEmailConnectionsInputSchema = z.object({}).strict();
export const AriaListEmailRoutesInputSchema = z.object({}).strict();
export const AriaGetEmailOutboxOverviewInputSchema = z.object({}).strict();
export const AriaListEmailDeliveriesInputSchema = DeliveryListQuerySchema;
export const AriaGetAuthMethodsConfigInputSchema = z.object({}).strict();
export const AriaGetTwoFactorPolicyInputSchema = z.object({}).strict();
export const AriaGetPlatformInfoInputSchema = z.object({}).strict();
export const AriaGetPlatformMetricsInputSchema = z.object({}).strict();

export const AriaReadPageInputSchema = z
  .object({
    slug: z.string().min(1),
    target: ContentReadTargetSchema.default("draft"),
    detail: ContentReadDetailSchema.default("summary"),
  })
  .strict();

export const AriaListLayoutsInputSchema = z.object({}).strict();

export const AriaListComponentsInputSchema = z.object({}).strict();

export const AriaReadComponentInputSchema = z
  .object({
    slug: z.string().min(1),
    target: ContentReadTargetSchema.default("draft"),
    detail: ContentReadDetailSchema.default("summary"),
  })
  .strict();

export const AriaReadLayoutInputSchema = z
  .object({
    slug: z.string().min(1),
    target: ContentReadTargetSchema.default("draft"),
    detail: ContentReadDetailSchema.default("summary"),
  })
  .strict();

export const AriaGetDesignSystemInputSchema = z
  .object({
    detail: ContentReadDetailSchema.default("summary"),
  })
  .strict();

export const AriaGetDiscoveryReportInputSchema = z.object({}).strict();
export const AriaGetDiscoveryArtifactsInputSchema = z.object({}).strict();
export const AriaGetDiscoveryBaselineInputSchema = z
  .object({
    artifact: z.enum(["robots", "sitemap", "llms"]),
  })
  .strict();
export const AriaGetAnalyticsAvailabilityInputSchema = z.object({}).strict();
export const AriaGetTrafficSummaryInputSchema = z
  .object({
    force: z.boolean().optional(),
  })
  .strict();
export const AriaGetSiteTrafficInputSchema = z
  .object({
    period: z.enum(["24h", "7d", "30d"]).default("7d"),
    force: z.boolean().optional(),
  })
  .strict();
export const AriaGetPagesTrafficInputSchema = AriaGetSiteTrafficInputSchema;
export const AriaGetPageTrafficInputSchema =
  AriaGetSiteTrafficInputSchema.extend({
    slug: z.string().min(1),
  }).strict();
