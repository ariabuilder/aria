/**
 * Aria Router
 *
 * Single source of truth for all routing/navigation types.
 */

import { z } from "zod";

// STUDIO SECTIONS (Management Mode)

export const StudioSectionSchema = z.enum([
  "dashboard",
  "pages",
  "layouts",
  "routes",
  "components",
  "collections",
  "media",
  "design",
  "colors",
  "typography",
  "effects",
  "breakpoints",
  "globals",
  "config",
  "integrations",
  "deployment",
]);

export type StudioSection = z.infer<typeof StudioSectionSchema>;

// EDITING TABS (Editing Mode Sidebar)

export const EditingTabSchema = z.enum([
  "add-elements",
  "layers",
  "agent",
  "components",
  "settings",
]);

export type EditingTab = z.infer<typeof EditingTabSchema>;

export const EditableItemTypeSchema = z.enum(["page", "layout", "component"]);

export type EditableItemType = z.infer<typeof EditableItemTypeSchema>;

export const AppModeSchema = z.enum(["studio", "stage"]);

export type AppMode = z.infer<typeof AppModeSchema>;

export const AppNavigationStateSchema = z.object({
  // Editing target (null = not editing = studio mode)
  itemType: EditableItemTypeSchema.nullable(),
  itemSlug: z.string().nullable(),

  studioSection: StudioSectionSchema,
});

export type AppNavigationState = z.infer<typeof AppNavigationStateSchema>;

export const RouterCompatibilityStateSchema = z.object({
  editingTab: EditingTabSchema,

  leftSidebarOpen: z.boolean(),
  rightSidebarOpen: z.boolean(),
});

export type RouterCompatibilityState = z.infer<
  typeof RouterCompatibilityStateSchema
>;

export const RouterStateSchema = AppNavigationStateSchema.extend(
  RouterCompatibilityStateSchema.shape,
);

export type RouterState = z.infer<typeof RouterStateSchema>;

// PERSISTED STATE (what goes to localStorage)

export const PersistedRouterStateSchema = z.object({
  navigation: AppNavigationStateSchema,
  compatibility: RouterCompatibilityStateSchema,
  timestamp: z.number(),
  version: z.literal(2),
});

export type PersistedRouterState = z.infer<typeof PersistedRouterStateSchema>;

export const LegacyPersistedRouterStateSchema = RouterStateSchema.extend({
  timestamp: z.number(),
  version: z.literal(1),
});

export type LegacyPersistedRouterState = z.infer<
  typeof LegacyPersistedRouterStateSchema
>;

// EDITING MODE (Computed/Derived)

export const EditingModeSchema = z.object({
  isEditing: z.boolean(),
  itemType: EditableItemTypeSchema.nullable(),
  itemSlug: z.string().nullable(),
});

export type EditingMode = z.infer<typeof EditingModeSchema>;

export const DEFAULT_ROUTER_STATE: RouterState = {
  itemType: null,
  itemSlug: null,
  studioSection: "dashboard",
  editingTab: "layers",
  leftSidebarOpen: true,
  rightSidebarOpen: true,
};

export const StartEditingPayloadSchema = z.object({
  itemType: EditableItemTypeSchema,
  itemSlug: z.string().min(1),
});

export type StartEditingPayload = z.infer<typeof StartEditingPayloadSchema>;

export const NavigateToStudioPayloadSchema = z.object({
  section: StudioSectionSchema.optional(),
});

export type NavigateToStudioPayload = z.infer<
  typeof NavigateToStudioPayloadSchema
>;
