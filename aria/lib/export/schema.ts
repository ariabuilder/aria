import { z } from "astro/zod";
import {
  CmsExportOptionsSchema,
  SiteExportMediaModeSchema,
  SiteExportPresetSchema,
  SiteExportSectionSchema,
  SiteExportSelectionSchema,
} from "./cmsTypes";

export const SiteExportOwnerSchema = z.object({
  id: z.uuid(),
  username: z.string().min(1),
});

export const SiteExportRecordSchema = z.object({
  id: z.uuid(),
  filename: z.string().min(1),
  artifactKey: z.string().min(1),
  metadataKey: z.string().min(1),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  createdBy: SiteExportOwnerSchema,
  pageCount: z.int().nonnegative(),
  mediaCount: z.int().nonnegative(),
  cmsCollectionCount: z.int().nonnegative().default(0),
  cmsEntryCount: z.int().nonnegative().default(0),
  redirectCount: z.int().nonnegative().default(0),
  sizeBytes: z.int().nonnegative(),
  downloadPath: z.string().min(1),
});

export type SiteExportRecord = z.infer<typeof SiteExportRecordSchema>;

export {
  CmsExportOptionsSchema,
  SiteExportMediaModeSchema,
  SiteExportPresetSchema,
  SiteExportSectionSchema,
  SiteExportSelectionSchema,
};

export type {
  CmsExportOptions,
  SiteExportMediaMode,
  SiteExportPreset,
  SiteExportSection,
  SiteExportSelection,
} from "./cmsTypes";

export const CreateSiteExportInputSchema = z.object({
  ttlMinutes: z.int().min(1).max(Number.MAX_SAFE_INTEGER).default(15),
  selection: SiteExportSelectionSchema.optional(),
});

export type CreateSiteExportInput = z.infer<typeof CreateSiteExportInputSchema>;

export const DeleteSiteExportInputSchema = z.object({
  id: z.uuid(),
});

export type DeleteSiteExportInput = z.infer<typeof DeleteSiteExportInputSchema>;

export const SiteExportActionPayloadSchema = z.object({
  export: SiteExportRecordSchema.nullable(),
  estimatedMediaBytes: z.int().nonnegative().optional(),
});

export type SiteExportActionPayload = z.infer<
  typeof SiteExportActionPayloadSchema
>;

export const SiteExportListPayloadSchema = z.object({
  exports: z.array(SiteExportRecordSchema),
});

export type SiteExportListPayload = z.infer<typeof SiteExportListPayloadSchema>;
