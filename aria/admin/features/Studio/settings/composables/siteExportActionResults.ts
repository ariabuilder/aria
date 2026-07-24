import { z } from "zod";

import { log } from "@/lib/utils/logger";

const NonEmptyStringSchema = z.string().trim().min(1);

const SiteExportInventoryItemSchema = z.strictObject({
  id: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
});

const SiteExportInventorySchema = z.strictObject({
  pages: z.array(SiteExportInventoryItemSchema),
  layouts: z.array(SiteExportInventoryItemSchema),
  components: z.array(SiteExportInventoryItemSchema),
  cmsCollections: z.array(SiteExportInventoryItemSchema).default([]),
  cmsEntries: z
    .array(
      SiteExportInventoryItemSchema.extend({
        count: z.int().nonnegative().default(0),
      }),
    )
    .default([]),
  error: NonEmptyStringSchema.optional(),
});

const SiteExportOwnerSchema = z.looseObject({
  id: NonEmptyStringSchema,
  username: NonEmptyStringSchema,
});

const SiteExportRecordSchema = z.looseObject({
  id: NonEmptyStringSchema,
  filename: NonEmptyStringSchema,
  artifactKey: NonEmptyStringSchema,
  metadataKey: NonEmptyStringSchema,
  createdAt: NonEmptyStringSchema,
  expiresAt: NonEmptyStringSchema,
  createdBy: SiteExportOwnerSchema,
  pageCount: z.int().nonnegative(),
  mediaCount: z.int().nonnegative(),
  cmsCollectionCount: z.int().nonnegative().default(0),
  cmsEntryCount: z.int().nonnegative().default(0),
  redirectCount: z.int().nonnegative().default(0),
  sizeBytes: z.int().nonnegative(),
  downloadPath: NonEmptyStringSchema,
});

const SiteExportPayloadSchema = z.strictObject({
  export: SiteExportRecordSchema.nullable(),
  estimatedMediaBytes: z.int().nonnegative().optional(),
});

const SiteExportListPayloadSchema = z.strictObject({
  exports: z.array(SiteExportRecordSchema),
});

const SiteExportDeleteResultSchema = z.strictObject({
  success: z.boolean(),
  deletedId: z.uuid().optional(),
});

interface SiteExportTransportErrorLike {
  message?: string;
}

interface SiteExportTransportResult {
  data?: unknown;
  error?: SiteExportTransportErrorLike | null;
}

type ParsedInventory = z.infer<typeof SiteExportInventorySchema>;
type ParsedExportPayload = z.infer<typeof SiteExportPayloadSchema>;
type ParsedExportList = z.infer<typeof SiteExportListPayloadSchema>;

export function unwrapSiteExportInventoryResult(
  result: SiteExportTransportResult,
  fallback: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: ParsedInventory }
  | { success: false; error: string } {
  if (result.error) {
    return {
      success: false,
      error: result.error.message ?? fallback,
    };
  }

  const parsedResult = SiteExportInventorySchema.safeParse(result.data);
  if (!parsedResult.success) {
    log("warn", "[SiteExport] Invalid export inventory response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  if (parsedResult.data.error) {
    return {
      success: false,
      error: parsedResult.data.error,
    };
  }

  return {
    success: true,
    data: parsedResult.data,
  };
}

export function unwrapSiteExportPayloadResult(
  result: SiteExportTransportResult,
  fallback: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: ParsedExportPayload }
  | { success: false; error: string } {
  if (result.error) {
    return {
      success: false,
      error: result.error.message ?? fallback,
    };
  }

  const parsedResult = SiteExportPayloadSchema.safeParse(result.data);
  if (!parsedResult.success) {
    log("warn", "[SiteExport] Invalid site export payload", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  return {
    success: true,
    data: parsedResult.data,
  };
}

export function unwrapSiteExportListResult(
  result: SiteExportTransportResult,
  fallback: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: ParsedExportList }
  | { success: false; error: string } {
  if (result.error) {
    return {
      success: false,
      error: result.error.message ?? fallback,
    };
  }

  const parsedResult = SiteExportListPayloadSchema.safeParse(result.data);
  if (!parsedResult.success) {
    log("warn", "[SiteExport] Invalid site export list response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  return {
    success: true,
    data: parsedResult.data,
  };
}

export function unwrapSiteExportDeleteResult(
  result: SiteExportTransportResult,
  fallback: string,
  context: Record<string, unknown> = {},
): { success: true } | { success: false; error: string } {
  if (result.error) {
    return {
      success: false,
      error: result.error.message ?? fallback,
    };
  }

  const parsedResult = SiteExportDeleteResultSchema.safeParse(result.data);
  if (!parsedResult.success) {
    log("warn", "[SiteExport] Invalid site export delete response", {
      issues: parsedResult.error.issues,
      ...context,
    });
    return {
      success: false,
      error: fallback,
    };
  }

  if (!parsedResult.data.success) {
    return {
      success: false,
      error: fallback,
    };
  }

  return { success: true };
}
