import { z } from "astro/zod";

/** Client-safe copy — keep in sync with `mediaReferenceUpdate.ts`. */
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

export const MediaMutationReferenceSummarySchema = z
  .object({
    updatedResources: z.int().nonnegative(),
    updatedLocations: z.int().nonnegative(),
    failures: z.array(MediaReferenceUpdateFailureSchema),
    warnings: z.array(z.string().min(1)),
  })
  .strict();

export type MediaMutationReferenceSummary = z.infer<
  typeof MediaMutationReferenceSummarySchema
>;

export const DeleteMediaResultSchema = z
  .object({
    success: z.literal(true),
    status: z.enum(["completed", "incomplete"]),
    deleted: z.boolean(),
    references: MediaMutationReferenceSummarySchema,
  })
  .strict();

export type DeleteMediaResult = z.infer<typeof DeleteMediaResultSchema>;

export const RenameMediaResultSchema = z
  .object({
    success: z.literal(true),
    status: z.enum(["completed", "incomplete"]),
    oldRetained: z.boolean(),
    oldPath: z.string().min(1),
    newPath: z.string().min(1),
    url: z.string().min(1),
    publicUrl: z.string().min(1),
    references: MediaMutationReferenceSummarySchema,
  })
  .strict();

export type RenameMediaResult = z.infer<typeof RenameMediaResultSchema>;

const EMPTY_REFERENCE_SUMMARY: MediaMutationReferenceSummary = {
  updatedResources: 0,
  updatedLocations: 0,
  failures: [],
  warnings: [],
};

export type MediaReferenceUpdateResultLike = {
  updatedResources: number;
  updatedLocations: number;
  failures: MediaReferenceUpdateFailure[];
  warnings: string[];
};

export function toMediaMutationReferenceSummary(
  result: MediaReferenceUpdateResultLike,
): MediaMutationReferenceSummary {
  return MediaMutationReferenceSummarySchema.parse({
    updatedResources: result.updatedResources,
    updatedLocations: result.updatedLocations,
    failures: result.failures,
    warnings: result.warnings,
  });
}

export function createEmptyMediaMutationReferenceSummary(): MediaMutationReferenceSummary {
  return MediaMutationReferenceSummarySchema.parse(EMPTY_REFERENCE_SUMMARY);
}

export function coerceMediaMutationReferenceSummary(
  value: unknown,
): MediaMutationReferenceSummary {
  const parsed = MediaMutationReferenceSummarySchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  return createEmptyMediaMutationReferenceSummary();
}

export function referencesNeedManualCleanup(
  summary: MediaMutationReferenceSummary,
): boolean {
  return summary.failures.length > 0 || summary.warnings.length > 0;
}
