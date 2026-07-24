import { z } from "zod";
import { normalizeExternalMediaUrl } from "../media/utils/externalMediaUrl";
import { MediaAssetSchema, type MediaAsset } from "./mediaAsset";

export const GetPageMediaInputSchema = z
  .object({
    slug: z.string().min(1),
  })
  .strict();

export type GetPageMediaInput = z.infer<typeof GetPageMediaInputSchema>;

export const CollectedMediaReferenceSchema = z
  .object({
    logicalPath: z.string().min(1),
    rawUrl: z.string().min(1),
    refPath: z.string(),
  })
  .strict();

export type CollectedMediaReference = z.infer<typeof CollectedMediaReferenceSchema>;

export const PageMediaLibraryAssetSchema = MediaAssetSchema.extend({
  source: z.literal("library"),
  refPaths: z.array(z.string()).optional(),
}).strict();

export type PageMediaLibraryAsset = z.infer<typeof PageMediaLibraryAssetSchema>;

export const PageMediaExternalAssetSchema = MediaAssetSchema.extend({
  source: z.literal("external"),
  rawUrl: z.string().min(1),
  refPath: z.string(),
}).strict();

export type PageMediaExternalAsset = z.infer<typeof PageMediaExternalAssetSchema>;

export const PageMediaMissingAssetSchema = MediaAssetSchema.extend({
  source: z.literal("missing"),
  logicalPath: z.string().min(1),
  refPath: z.string(),
}).strict();

export type PageMediaMissingAsset = z.infer<typeof PageMediaMissingAssetSchema>;

export const PageMediaMissingComponentSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export type PageMediaMissingComponent = z.infer<
  typeof PageMediaMissingComponentSchema
>;

export const GetPageMediaOutputSchema = z
  .object({
    assets: z.array(PageMediaLibraryAssetSchema),
    external: z.array(PageMediaExternalAssetSchema),
    missing: z.array(PageMediaMissingAssetSchema),
    missingComponents: z.array(PageMediaMissingComponentSchema),
    truncated: z.boolean().optional(),
  })
  .strict();

export type GetPageMediaOutput = z.infer<typeof GetPageMediaOutputSchema>;

export const PageMediaDisplayItemSchema = z.discriminatedUnion("source", [
  PageMediaLibraryAssetSchema,
  PageMediaExternalAssetSchema,
  PageMediaMissingAssetSchema,
]);

export type PageMediaDisplayItem = z.infer<typeof PageMediaDisplayItemSchema>;

export function toPageMediaDisplayItems(
  output: GetPageMediaOutput,
): PageMediaDisplayItem[] {
  return [...output.assets, ...output.external, ...output.missing];
}

function previewUrlForItem(item: PageMediaDisplayItem, value?: string): string | undefined {
  if (!value) {
    return value;
  }

  if (item.source === "external") {
    return normalizeExternalMediaUrl(value);
  }

  return value;
}

/** Strip page-media fields for library preview components. */
export function toMediaAssetForPreview(item: PageMediaDisplayItem): MediaAsset {
  const url = previewUrlForItem(item, item.url) ?? item.url;
  const publicUrl = previewUrlForItem(item, item.publicUrl);
  const deliveryUrl = previewUrlForItem(item, item.deliveryUrl ?? item.url) ?? url;
  const thumbnailUrl =
    previewUrlForItem(item, item.thumbnailUrl ?? item.deliveryUrl ?? item.url) ??
    deliveryUrl;

  return MediaAssetSchema.parse({
    id: item.id,
    name: item.name,
    type: item.type,
    url,
    publicUrl,
    deliveryUrl,
    thumbnailUrl,
    endpointId: item.endpointId,
    isTransformed: item.isTransformed,
    transformProvider: item.transformProvider,
    size: item.size,
    dimensions: item.dimensions,
    mimeType: item.mimeType,
    uploadedAt: item.uploadedAt,
  });
}
