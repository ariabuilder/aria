import { z } from "zod";

import {
  parseActionPayload,
  unwrapActionPayload,
  type ActionTransportResult,
} from "@/lib/actions/actionResult";
import {
  MediaAssetSchema,
  MediaAssetTypeSchema,
  MediaAssetsListSchema,
  type MediaAsset,
  type MediaAssetType,
} from "../../../../../lib/schemas/mediaAsset";
import {
  createEmptyMediaMutationReferenceSummary,
  DeleteMediaResultSchema,
  MediaMutationReferenceSummarySchema,
  RenameMediaResultSchema,
  referencesNeedManualCleanup,
} from "../../../../../lib/schemas/mediaMutations";
import {
  logicalPathToObjectKey,
  normalizeLogicalMediaPath,
} from "../../../../../lib/media/utils/path";

import {
  SyncApplyResponseSchema,
  SyncHistoryResponseSchema,
  SyncPlanResponseSchema,
} from "../types/media-sync";

export {
  MediaAssetSchema,
  MediaAssetTypeSchema,
  MediaAssetsListSchema,
  type MediaAsset,
  type MediaAssetType,
};

export const MediaUsageRecordSchema = z
  .object({
    kind: z.enum([
      "page",
      "layout",
      "component",
      "cms-entry",
      "page-locale",
      "layout-locale",
      "site-settings",
      "design-system",
    ]),
    refId: z.string().min(1),
    refPath: z.string().nullable().optional(),
  })
  .transform((value) => ({
    kind: value.kind,
    refId: value.refId,
    refPath: value.refPath ?? null,
  }));

export const MediaUsagesResponseSchema = z
  .object({
    available: z.boolean(),
    source: z.enum(["indexed", "unavailable"]),
    usages: z.array(MediaUsageRecordSchema),
  })
  .strict();

export const UploadMediaResultSchema = z
  .object({
    success: z.literal(true),
    url: z.string().min(1),
    publicUrl: z.string().min(1),
    name: z.string().min(1),
    size: z.number(),
    type: MediaAssetTypeSchema,
    endpointId: z.string().min(1),
  })
  .strict();

export type UploadMediaResult = z.infer<typeof UploadMediaResultSchema>;

export {
  DeleteMediaResultSchema,
  RenameMediaResultSchema,
  referencesNeedManualCleanup,
};

export type DeleteMediaResult = z.infer<typeof DeleteMediaResultSchema>;
export type RenameMediaResult = z.infer<typeof RenameMediaResultSchema>;

export function parseMediaListPayload(
  data: unknown,
  context: Record<string, unknown> = {},
): MediaAsset[] | null {
  return parseActionPayload(data ?? [], MediaAssetsListSchema, {
    invalidLogMessage: "[Media] Invalid media list payload",
    context,
  });
}

export function parseUploadMediaPayload(
  data: unknown,
  context: Record<string, unknown> = {},
): UploadMediaResult | null {
  return parseActionPayload(data, UploadMediaResultSchema, {
    invalidLogMessage: "[Media] Invalid upload payload",
    context,
  });
}

/** @deprecated Prefer `parseUploadMediaPayload` for typed results. */
export function validateMediaUploadPayload(
  data: unknown,
  context: Record<string, unknown> = {},
): boolean {
  return parseUploadMediaPayload(data, context) !== null;
}

export function parseDeleteMediaPayload(
  data: unknown,
  context: Record<string, unknown> = {},
): z.infer<typeof DeleteMediaResultSchema> | null {
  return parseActionPayload(data, DeleteMediaActionPayloadSchema, {
    invalidLogMessage: "[Media] Invalid delete response payload",
    context,
  });
}

/** @deprecated Prefer `parseDeleteMediaPayload` for typed results. */
export function validateMediaDeletePayload(
  data: unknown,
  context: Record<string, unknown> = {},
): boolean {
  return parseDeleteMediaPayload(data, context) !== null;
}

function normalizeRenameObjectKey(value: string): string {
  try {
    return logicalPathToObjectKey(normalizeLogicalMediaPath(value));
  } catch {
    return value;
  }
}

function coerceMediaMutationReferenceSummary(
  value: unknown,
): z.infer<typeof MediaMutationReferenceSummarySchema> {
  const parsed = MediaMutationReferenceSummarySchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  return createEmptyMediaMutationReferenceSummary();
}

const DeleteMediaActionPayloadSchema = z
  .object({
    success: z.literal(true),
    status: z.enum(["completed", "incomplete"]).optional(),
    deleted: z.boolean().optional(),
    references: z.unknown().optional(),
  })
  .transform((value) => ({
    success: value.success,
    status: value.status ?? "completed",
    deleted: value.deleted ?? true,
    references: coerceMediaMutationReferenceSummary(value.references),
  }));

const RenameMediaActionPayloadSchema = z
  .object({
    success: z.literal(true),
    status: z.enum(["completed", "incomplete"]).optional(),
    oldRetained: z.boolean().optional(),
    oldPath: z.string().min(1),
    newPath: z.string().min(1),
    url: z.string().min(1).optional(),
    publicUrl: z.string().min(1).optional(),
    references: z.unknown().optional(),
  })
  .transform((value) => {
    const newPath = normalizeRenameObjectKey(value.newPath);
    const oldPath = normalizeRenameObjectKey(value.oldPath);
    const url = value.url ?? normalizeLogicalMediaPath(newPath);
    const publicUrl = value.publicUrl ?? url;

    return {
      success: value.success,
      status: value.status ?? "completed",
      oldRetained: value.oldRetained ?? false,
      oldPath,
      newPath,
      url,
      publicUrl,
      references: coerceMediaMutationReferenceSummary(value.references),
    };
  });

export function parseRenameMediaPayload(
  data: unknown,
  context: Record<string, unknown> = {},
): RenameMediaResult | null {
  return parseActionPayload(data, RenameMediaActionPayloadSchema, {
    invalidLogMessage: "[Media] Invalid rename response payload",
    context,
  });
}

function unwrapMediaSyncActionResult<TSchema extends z.ZodTypeAny>(
  result: ActionTransportResult,
  schema: TSchema,
  fallbackMessage: string,
  invalidMessage: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: z.infer<TSchema> }
  | { success: false; error: string } {
  return unwrapActionPayload(result, schema, {
    fallbackMessage,
    invalidLogMessage: invalidMessage,
    context,
    requireData: true,
  });
}

export function unwrapMediaSyncHistoryResult(
  result: ActionTransportResult,
  context: Record<string, unknown> = {},
):
  | { success: true; data: z.infer<typeof SyncHistoryResponseSchema> }
  | { success: false; error: string } {
  return unwrapMediaSyncActionResult(
    result,
    SyncHistoryResponseSchema,
    "Failed to fetch media sync history",
    "[Media] Invalid sync history response",
    context,
  );
}

export function unwrapMediaSyncPlanResult(
  result: ActionTransportResult,
  context: Record<string, unknown> = {},
):
  | { success: true; data: z.infer<typeof SyncPlanResponseSchema> }
  | { success: false; error: string } {
  return unwrapMediaSyncActionResult(
    result,
    SyncPlanResponseSchema,
    "Failed to generate sync plan",
    "[Media] Invalid sync plan response",
    context,
  );
}

export function unwrapMediaSyncApplyResult(
  result: ActionTransportResult,
  context: Record<string, unknown> = {},
):
  | { success: true; data: z.infer<typeof SyncApplyResponseSchema> }
  | { success: false; error: string } {
  return unwrapMediaSyncActionResult(
    result,
    SyncApplyResponseSchema,
    "Failed to apply sync plan",
    "[Media] Invalid sync apply response",
    context,
  );
}

export function unwrapMediaUsagesResult(
  result: ActionTransportResult,
  context: Record<string, unknown> = {},
):
  | { success: true; data: z.infer<typeof MediaUsagesResponseSchema> }
  | { success: false; error: string } {
  return unwrapMediaSyncActionResult(
    result,
    MediaUsagesResponseSchema,
    "Failed to load media usage",
    "[Media] Invalid media usages response",
    context,
  );
}
