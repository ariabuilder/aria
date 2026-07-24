import { z } from "zod";

export const MediaAssetTypeSchema = z.enum([
  "image",
  "video",
  "icon",
  "document",
  "archive",
  "other",
]);

export type MediaAssetType = z.infer<typeof MediaAssetTypeSchema>;

export const MediaAssetDimensionsSchema = z
  .object({
    width: z.number(),
    height: z.number(),
  })
  .strict();

export const MediaAssetSchema = z
  .object({
    id: z.string().min(1),
    mediaId: z.string().min(1).optional(),
    name: z.string().min(1),
    type: MediaAssetTypeSchema,
    url: z.string().min(1),
    publicUrl: z.string().optional(),
    deliveryUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    endpointId: z.string().optional(),
    objectKey: z.string().optional(),
    isTransformed: z.boolean().optional(),
    transformProvider: z.string().optional(),
    cropCount: z.number().int().nonnegative().optional(),
    size: z.number().nonnegative(),
    dimensions: MediaAssetDimensionsSchema.optional(),
    mimeType: z.string().optional(),
    uploadedAt: z.string().optional(),
  })
  .strict();

export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const MediaAssetsListSchema = z.array(MediaAssetSchema);
