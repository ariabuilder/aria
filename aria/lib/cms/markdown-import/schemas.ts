import { z } from "zod";
import { FIELD_TYPES } from "../constants";
import { AriaCollectionSchema } from "../schemas";

export const MarkdownImportSourceSchema = z
  .object({
    path: z.string().trim().min(1).max(512),
    content: z.string().max(1_000_000),
  })
  .strict();
export type MarkdownImportSource = z.infer<typeof MarkdownImportSourceSchema>;

export const MarkdownImportModeSchema = z.enum(["create", "update"]);
export type MarkdownImportMode = z.infer<typeof MarkdownImportModeSchema>;

export const MarkdownImportSuggestedFieldSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    type: z.enum(FIELD_TYPES),
    allowedTypes: z.array(z.enum(FIELD_TYPES)).min(1),
    options: z
      .array(z.string().trim().min(1).max(120))
      .min(1)
      .max(64)
      .optional(),
    sourcePaths: z.array(z.string().trim().min(1).max(512)).min(1).max(250),
    sample: z.unknown(),
  })
  .strict();
export type MarkdownImportSuggestedField = z.infer<
  typeof MarkdownImportSuggestedFieldSchema
>;

export const MarkdownImportSelectedFieldSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    type: z.enum(FIELD_TYPES),
  })
  .strict();
export type MarkdownImportSelectedField = z.infer<
  typeof MarkdownImportSelectedFieldSchema
>;

export const MarkdownImportDiagnosticSchema = z
  .object({
    code: z.string().trim().min(1).max(80),
    severity: z.enum(["error", "warning", "info"]),
    path: z.string().trim().min(1).max(512),
    message: z.string().trim().min(1).max(500),
    remediation: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type MarkdownImportDiagnostic = z.infer<
  typeof MarkdownImportDiagnosticSchema
>;

export const MarkdownImportItemSchema = z
  .object({
    sourcePath: z.string().trim().min(1).max(512),
    title: z.string().trim().min(1).max(500).nullable(),
    slug: z.string().trim().min(1).max(200).nullable(),
    locale: z.string().trim().min(1).max(35).nullable(),
    action: z.enum(["create", "update", "skip", "fail"]),
    diagnostics: z.array(MarkdownImportDiagnosticSchema),
  })
  .strict();
export type MarkdownImportItem = z.infer<typeof MarkdownImportItemSchema>;

export const MarkdownImportSummarySchema = z
  .object({
    creates: z.int().nonnegative(),
    updates: z.int().nonnegative(),
    skips: z.int().nonnegative(),
    errors: z.int().nonnegative(),
    warnings: z.int().nonnegative(),
  })
  .strict();
export type MarkdownImportSummary = z.infer<typeof MarkdownImportSummarySchema>;

export const MarkdownImportPreviewInputSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    sources: z.array(MarkdownImportSourceSchema).min(1).max(250),
    mode: MarkdownImportModeSchema.default("create"),
  })
  .strict()
  .superRefine((value, context) => {
    const totalBytes = value.sources.reduce(
      (total, source) =>
        total + new TextEncoder().encode(source.content).byteLength,
      0,
    );
    if (totalBytes > 10 * 1024 * 1024) {
      context.addIssue({
        code: "custom",
        message: "Markdown import sources exceed the 10 MB content limit.",
        path: ["sources"],
      });
    }
  });
export type MarkdownImportPreviewInput = z.infer<
  typeof MarkdownImportPreviewInputSchema
>;

export const MarkdownImportApplyInputSchema =
  MarkdownImportPreviewInputSchema.extend({
    addFields: z.array(MarkdownImportSelectedFieldSchema).max(64).default([]),
  });
export type MarkdownImportApplyInput = z.input<
  typeof MarkdownImportApplyInputSchema
>;

export const MarkdownImportPreviewSchema = z
  .object({
    collection: AriaCollectionSchema,
    mode: MarkdownImportModeSchema,
    canApply: z.boolean(),
    items: z.array(MarkdownImportItemSchema),
    fieldSuggestions: z.array(MarkdownImportSuggestedFieldSchema),
    summary: MarkdownImportSummarySchema,
  })
  .strict();
export type MarkdownImportPreview = z.infer<typeof MarkdownImportPreviewSchema>;

export const MarkdownImportApplyReportSchema =
  MarkdownImportPreviewSchema.extend({
    applied: z.boolean(),
    addedFieldKeys: z.array(z.string().trim().min(1)).default([]),
  });
export type MarkdownImportApplyReport = z.infer<
  typeof MarkdownImportApplyReportSchema
>;
