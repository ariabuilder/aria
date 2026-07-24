import { z } from "zod";

export const NormalizedCoordinateSchema = z.number().min(0).max(1);

export const MediaCropRectSchema = z
  .object({
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict()
  .superRefine((crop, context) => {
    if (crop.x + crop.width > 1.000001) {
      context.addIssue({
        code: "custom",
        path: ["width"],
        message: "Crop exceeds the source width",
      });
    }
    if (crop.y + crop.height > 1.000001) {
      context.addIssue({
        code: "custom",
        path: ["height"],
        message: "Crop exceeds the source height",
      });
    }
  });

export type MediaCropRect = z.infer<typeof MediaCropRectSchema>;

export const MediaFocalPointSchema = z
  .object({
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
  })
  .strict();

export type MediaFocalPoint = z.infer<typeof MediaFocalPointSchema>;

export const MediaAspectRatioSchema = z
  .object({
    width: z.number().positive().max(100),
    height: z.number().positive().max(100),
  })
  .strict();

export const MediaTransformOutputSchema = z
  .object({
    width: z.int().positive().max(12_000).nullable().default(null),
    height: z.int().positive().max(12_000).nullable().default(null),
    format: z.enum(["auto", "jpeg", "png", "webp", "avif"]).default("auto"),
    quality: z.int().min(1).max(100).default(100),
  })
  .strict();

export type MediaTransformOutput = z.infer<typeof MediaTransformOutputSchema>;

export const MediaAssetProfileSchema = z
  .object({
    assetPath: z.string().trim().min(1),
    currentSourceVersion: z.int().positive(),
    altText: z.string().max(2_000).nullable(),
    title: z.string().max(500).nullable(),
    caption: z.string().max(4_000).nullable(),
    credit: z.string().max(500).nullable(),
    copyright: z.string().max(500).nullable(),
    focalPoint: MediaFocalPointSchema.nullable(),
    createdAt: z.string().trim().min(1),
    updatedAt: z.string().trim().min(1),
  })
  .strict();

export type MediaAssetProfile = z.infer<typeof MediaAssetProfileSchema>;

export const MediaSourceVersionSchema = z
  .object({
    assetPath: z.string().trim().min(1),
    version: z.int().positive(),
    objectKey: z.string().trim().min(1),
    checksumSha256: z.string().trim().min(1).nullable(),
    mimeType: z.string().trim().min(1).nullable(),
    sizeBytes: z.int().nonnegative(),
    width: z.int().positive().nullable(),
    height: z.int().positive().nullable(),
    createdAt: z.string().trim().min(1),
  })
  .strict();

export type MediaSourceVersion = z.infer<typeof MediaSourceVersionSchema>;

export const RelocateMediaSourceVersionInputSchema =
  MediaSourceVersionSchema.pick({
    assetPath: true,
    version: true,
    objectKey: true,
    checksumSha256: true,
    mimeType: true,
    sizeBytes: true,
    width: true,
    height: true,
  }).extend({
    expectedObjectKey: z.string().trim().min(1),
  });

export type RelocateMediaSourceVersionInput = z.infer<
  typeof RelocateMediaSourceVersionInputSchema
>;

export const MediaTransformVariantSchema = z
  .object({
    id: z.string().trim().min(1),
    assetPath: z.string().trim().min(1),
    name: z.string().trim().min(1).max(100),
    sourceVersion: z.int().positive(),
    crop: MediaCropRectSchema,
    focalPoint: MediaFocalPointSchema.nullable(),
    aspectRatio: MediaAspectRatioSchema.nullable(),
    output: MediaTransformOutputSchema,
    createdAt: z.string().trim().min(1),
    updatedAt: z.string().trim().min(1),
  })
  .strict();

export type MediaTransformVariant = z.infer<typeof MediaTransformVariantSchema>;

export const SaveMediaTransformVariantResultSchema = z
  .object({
    profile: MediaAssetProfileSchema,
    variant: MediaTransformVariantSchema,
  })
  .strict();

export type SaveMediaTransformVariantResult = z.infer<
  typeof SaveMediaTransformVariantResultSchema
>;

export const MediaTransformStateSchema = z
  .object({
    profile: MediaAssetProfileSchema.nullable(),
    sourceVersions: z.array(MediaSourceVersionSchema),
    variants: z.array(MediaTransformVariantSchema),
  })
  .strict();

export type MediaTransformState = z.infer<typeof MediaTransformStateSchema>;

export const SaveMediaAssetProfileInputSchema = MediaAssetProfileSchema.pick({
  assetPath: true,
  currentSourceVersion: true,
  altText: true,
  title: true,
  caption: true,
  credit: true,
  copyright: true,
  focalPoint: true,
}).extend({
  expectedUpdatedAt: z.string().trim().min(1).nullable().optional(),
});

export type SaveMediaAssetProfileInput = z.infer<
  typeof SaveMediaAssetProfileInputSchema
>;

export const PromoteMediaSourceVersionInputSchema = z
  .object({
    assetPath: z.string().trim().min(1),
    previousSourceVersion: z.int().positive(),
    nextSourceVersion: z.int().positive(),
    expectedUpdatedAt: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.nextSourceVersion <= input.previousSourceVersion) {
      context.addIssue({
        code: "custom",
        path: ["nextSourceVersion"],
        message: "The replacement source version must increase",
      });
    }
  });

export type PromoteMediaSourceVersionInput = z.infer<
  typeof PromoteMediaSourceVersionInputSchema
>;

export const ReplaceMediaSourceResultSchema = z
  .object({
    success: z.literal(true),
    status: z.enum(["completed", "incomplete"]),
    promoted: z.boolean(),
    previousSourceVersion: z.int().positive(),
    currentSourceVersion: z.int().positive(),
    oldSourceRetained: z.boolean(),
    stagedSourceRetained: z.boolean(),
    canonicalUpdated: z.boolean(),
    variants: z
      .object({
        preserved: z.int().nonnegative(),
        needsRebase: z.int().nonnegative(),
      })
      .strict(),
    profile: MediaAssetProfileSchema.nullable(),
    source: MediaSourceVersionSchema.nullable(),
    warnings: z.array(z.string()),
  })
  .strict();

export type ReplaceMediaSourceResult = z.infer<
  typeof ReplaceMediaSourceResultSchema
>;

export const SaveMediaTransformVariantInputSchema =
  MediaTransformVariantSchema.pick({
    id: true,
    assetPath: true,
    name: true,
    sourceVersion: true,
    crop: true,
    focalPoint: true,
    aspectRatio: true,
    output: true,
  }).extend({
    expectedUpdatedAt: z.string().trim().min(1).nullable().optional(),
  });

export type SaveMediaTransformVariantInput = z.infer<
  typeof SaveMediaTransformVariantInputSchema
>;
