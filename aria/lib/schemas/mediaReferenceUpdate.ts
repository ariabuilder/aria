import { z } from "astro/zod";

export const UpdateMediaReferencesModeSchema = z.enum(["scrub", "migrate"]);

export type UpdateMediaReferencesMode = z.infer<
  typeof UpdateMediaReferencesModeSchema
>;

export const MediaReferenceUpdateFailureSchema = z
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
    error: z.string().min(1),
  })
  .strict();

export type MediaReferenceUpdateFailure = z.infer<
  typeof MediaReferenceUpdateFailureSchema
>;

export const MediaReferenceUpdateResultSchema = z
  .object({
    mode: UpdateMediaReferencesModeSchema,
    logicalPath: z.string().min(1),
    newLogicalPath: z.string().min(1).optional(),
    indexedUsageCount: z.int().nonnegative(),
    scannedResources: z.int().nonnegative(),
    updatedResources: z.int().nonnegative(),
    updatedLocations: z.int().nonnegative(),
    failures: z.array(MediaReferenceUpdateFailureSchema),
    warnings: z.array(z.string().min(1)),
  })
  .strict();

export type MediaReferenceUpdateResult = z.infer<
  typeof MediaReferenceUpdateResultSchema
>;
