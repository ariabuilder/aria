import { z } from "zod";

export const CmsEntrySortKeySchema = z.enum([
  "title",
  "slug",
  "updatedAt",
  "publishedAt",
  "createdAt",
]);
export type CmsEntrySortKey = z.infer<typeof CmsEntrySortKeySchema>;

export const CmsEntrySortDirectionSchema = z.enum(["asc", "desc"]);
export type CmsEntrySortDirection = z.infer<typeof CmsEntrySortDirectionSchema>;

export const CmsEntrySortSchema = z
  .object({
    key: CmsEntrySortKeySchema,
    direction: CmsEntrySortDirectionSchema,
  })
  .strict();
export type CmsEntrySort = z.infer<typeof CmsEntrySortSchema>;

export function parseCmsEntrySort(value: unknown): CmsEntrySort {
  return CmsEntrySortSchema.catch({
    key: "updatedAt",
    direction: "desc",
  }).parse(value);
}
