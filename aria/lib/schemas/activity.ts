import { z } from "zod";

/**
 * All possible activity actions for page detail view
 */
export const ActivityActionEnum = z.enum([
  "page_created",
  "page_updated",
  "page_published",
  "page_scheduled",
  "page_unpublished",
  "page_archived",
  "page_restored",
  "page_deleted",
  "section_added",
  "section_removed",
  "section_reordered",
  "section_published",
  "section_unpublished",
  "section_visibility_toggled",
  "seo_updated",
  "meta_title_updated",
  "meta_description_updated",
  "og_image_updated",
  "settings_updated",
  "layout_changed",
  "parent_changed",
  "reverted",
]);

export type ActivityAction = z.infer<typeof ActivityActionEnum>;

/**
 * Metadata stored alongside each version for activity display
 */
export const ActivityMetadataSchema = z.object({
  action: ActivityActionEnum,
  userId: z.string().min(1),
  userName: z.string().min(1),
  userEmail: z.email().optional(),
  userAvatarUrl: z.string().nullable().optional(),
  target: z.string(), // Human-readable target description (e.g. "this page", "Hero Section")
  targetId: z.string().optional(), // Node ID if target is a section
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ActivityMetadata = z.infer<typeof ActivityMetadataSchema>;

export const GetPageActivityInputSchema = z.object({
  slug: z.string().min(1),
  limit: z.int().min(1).max(100).default(20),
  offset: z.int().min(0).default(0),
});

export type GetPageActivityInput = z.infer<typeof GetPageActivityInputSchema>;

/**
 * Single activity item returned from getPageActivity
 */
export const ActivityItemSchema = z.object({
  version: z.string(),
  createdAt: z.string(),
  activity: ActivityMetadataSchema.nullable(),
});

export type ActivityItem = z.infer<typeof ActivityItemSchema>;

export const GetPageActivityOutputSchema = z.object({
  items: z.array(ActivityItemSchema),
  total: z.number(),
});

export type GetPageActivityOutput = z.infer<typeof GetPageActivityOutputSchema>;

/**
 * Build activity metadata JSON string for version storage.
 * Validates input via Zod before returning.
 *
 * @param input - Activity metadata fields (userId/userName default to "system"/"System")
 * @returns JSON string suitable for storing in activity_metadata column
 */
export function buildActivityMeta(
  input: Omit<ActivityMetadata, "userId" | "userName"> & {
    userId?: string;
    userName?: string;
  },
): string {
  const parsed = ActivityMetadataSchema.parse({
    ...input,
    userId: input.userId ?? "system",
    userName: input.userName ?? "System",
  });
  return JSON.stringify(parsed);
}

/** Parse JSON stored in `aria_page_versions.activity_metadata`. */
export function parseStoredActivityMetadata(
  value: string | null | undefined,
): ActivityMetadata | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    return ActivityMetadataSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

const ACTIVITY_ACTION_LABELS: Record<ActivityAction, string> = {
  page_created: "created",
  page_updated: "updated",
  page_published: "published",
  page_scheduled: "scheduled",
  page_unpublished: "unpublished",
  page_archived: "archived",
  page_restored: "restored",
  page_deleted: "deleted",
  section_added: "added",
  section_removed: "removed",
  section_reordered: "reordered",
  section_published: "published",
  section_unpublished: "unpublished",
  section_visibility_toggled: "updated visibility for",
  seo_updated: "updated SEO for",
  meta_title_updated: "updated meta title for",
  meta_description_updated: "updated meta description for",
  og_image_updated: "updated OG image for",
  settings_updated: "updated settings for",
  layout_changed: "changed layout for",
  parent_changed: "changed parent for",
  reverted: "restored",
};

/** Human-readable past-tense verb for activity feed display. */
export function formatActivityActionLabel(action: ActivityAction): string {
  return ACTIVITY_ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}
