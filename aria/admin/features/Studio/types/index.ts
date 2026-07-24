import { z } from "zod";

export type StudioSection =
  | "dashboard"
  | "pages"
  | "layouts"
  | "components"
  | "collections"
  | "media"
  | "design"
  | "settings";

export interface StudioRouteMeta {
  section: StudioSection;
  title: string;
  requiresAuth?: boolean;
}

export interface StudioNavigationItem {
  id: StudioSection;
  label: string;
  icon: string;
  route: string;
  badge?: string;
}

export const StudioSelectionIdSchema = z.string().trim().min(1);

export const StudioPageDialogTargetSchema = z.object({
  id: StudioSelectionIdSchema,
  title: z.string().trim().min(1).optional(),
});

export type StudioPageDialogTarget = z.infer<
  typeof StudioPageDialogTargetSchema
>;

export const StudioCreatePagePayloadSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens",
    ),
  parent: z.string().trim().min(1).nullable().optional(),
  layout: z.string(),
});

export type StudioCreatePagePayload = z.infer<
  typeof StudioCreatePagePayloadSchema
>;

export interface StudioRouterReturn {
  currentRoute: ReturnType<typeof import("vue-router").useRoute>;
  activeSection: import("vue").ComputedRef<StudioSection>;
  pageTitle: import("vue").ComputedRef<string>;
  navigateTo: (section: StudioSection | string) => void;
  startEditing: (
    itemType: "page" | "layout" | "component",
    slug: string,
  ) => void;
  stopEditing: () => void;
  isEditing: import("vue").ComputedRef<boolean>;
  editingItemType: import("vue").ComputedRef<
    "page" | "layout" | "component" | null
  >;
  editingItemSlug: import("vue").ComputedRef<string | null>;
}
