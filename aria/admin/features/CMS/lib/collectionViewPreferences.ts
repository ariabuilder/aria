import { z } from "zod";
import { COLLECTION_KINDS } from "../../../../lib/cms/constants";

export const CmsCollectionViewModeSchema = z.enum(["table", "grid"]);
export type CmsCollectionViewMode = z.infer<typeof CmsCollectionViewModeSchema>;

export const CmsCollectionKindFilterSchema = z.union([
  z.literal("all"),
  z.enum(COLLECTION_KINDS),
]);
export type CmsCollectionKindFilter = z.infer<
  typeof CmsCollectionKindFilterSchema
>;

export const CmsCollectionSortKeySchema = z.enum([
  "label",
  "name",
  "kind",
  "itemCount",
]);
export type CmsCollectionSortKey = z.infer<typeof CmsCollectionSortKeySchema>;

export const CmsCollectionSortDirectionSchema = z.enum(["asc", "desc"]);
export type CmsCollectionSortDirection = z.infer<
  typeof CmsCollectionSortDirectionSchema
>;

export const CmsCollectionSortSchema = z
  .object({
    key: CmsCollectionSortKeySchema,
    direction: CmsCollectionSortDirectionSchema,
  })
  .strict();
export type CmsCollectionSort = z.infer<typeof CmsCollectionSortSchema>;

export function parseCmsCollectionViewMode(
  value: unknown,
): CmsCollectionViewMode {
  return CmsCollectionViewModeSchema.catch("table").parse(value);
}

export function parseCmsCollectionKindFilter(
  value: unknown,
): CmsCollectionKindFilter {
  return CmsCollectionKindFilterSchema.catch("all").parse(value);
}

export function parseCmsCollectionSort(value: unknown): CmsCollectionSort {
  return CmsCollectionSortSchema.catch({
    key: "label",
    direction: "asc",
  }).parse(value);
}
