import { z } from "zod";
import { ENTRY_STATUSES } from "../../../../lib/cms/constants";

export const CmsEntryViewModeSchema = z.enum(["table", "grid"]);
export type CmsEntryViewMode = z.infer<typeof CmsEntryViewModeSchema>;

export const CmsEntryStatusFilterSchema = z.union([
  z.literal("all"),
  z.enum(ENTRY_STATUSES),
]);
export type CmsEntryStatusFilter = z.infer<typeof CmsEntryStatusFilterSchema>;

export function parseCmsEntryViewMode(value: unknown): CmsEntryViewMode {
  return CmsEntryViewModeSchema.catch("table").parse(value);
}

export function parseCmsEntryStatusFilter(
  value: unknown,
): CmsEntryStatusFilter {
  return CmsEntryStatusFilterSchema.catch("all").parse(value);
}
