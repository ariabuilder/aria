import { z } from "zod";

import { JsonObjectSchema } from "@/lib/schemas/json";

export const COMPONENT_PREVIEW_ROOT_ATTR = "data-aria-component-preview-root";

export const ComponentPreviewGroupFilterSchema = z.enum(["all"]).or(
  z.string().regex(/^group:[^/\\]+$/),
);

export type ComponentPreviewGroupFilter = z.infer<
  typeof ComponentPreviewGroupFilterSchema
>;

export const ComponentPreviewSearchQuerySchema = z.string().trim();

export const ComponentPreviewFilterStateSchema = z.object({
  activeFilter: ComponentPreviewGroupFilterSchema,
  searchQuery: ComponentPreviewSearchQuerySchema,
});

export const ComponentPreviewFilterSchema = ComponentPreviewFilterStateSchema;

export type ComponentPreviewFilterState = z.infer<
  typeof ComponentPreviewFilterStateSchema
>;

export const ComponentThumbnailIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      !value.includes("/") &&
      !value.includes("\\") &&
      value !== "." &&
      value !== "..",
    "Invalid component thumbnail id",
  );

export const ComponentThumbnailMimeTypeSchema = z.enum([
  "image/webp",
  "image/png",
]);

export const ComponentThumbnailUploadSchema = z.object({
  componentId: ComponentThumbnailIdSchema,
  mimeType: ComponentThumbnailMimeTypeSchema,
  fileBase64: z.string().trim().min(1),
});

export const ComponentThumbnailSaveResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    componentId: ComponentThumbnailIdSchema,
    thumbnailUrl: z.string().trim().min(1),
  }),
});

export const ComponentThumbnailDeleteResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    componentId: ComponentThumbnailIdSchema,
    deleted: z.literal(true),
  }),
});

export const ComponentSnapshotSaveResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    componentId: ComponentThumbnailIdSchema,
    snapshotUrl: z.string().trim().min(1),
  }),
});

export const ComponentSnapshotQuerySchema = z.object({
  thumb: z.enum(["0", "1"]).optional(),
  refresh: z.enum(["0", "1"]).optional(),
});

export const ComponentDragPayloadSchema = JsonObjectSchema.and(
  z.object({
    type: z.literal("component"),
    componentSlug: z.string().trim().min(1),
    data: JsonObjectSchema,
  }),
);

export type ComponentDragPayload = z.infer<typeof ComponentDragPayloadSchema>;

export const ComponentInsertPayloadSchema = z
  .object({
    type: z.literal("component"),
    data: JsonObjectSchema,
    componentSlug: z.string().trim().min(1),
    parentId: z.string().trim().min(1).optional(),
    position: z.int().min(0).optional(),
  })
  .strict();

export type ComponentInsertPayload = z.infer<
  typeof ComponentInsertPayloadSchema
>;

export function toGroupFilter(groupId: string | null): ComponentPreviewGroupFilter {
  if (groupId === null) {
    return "all";
  }
  const parsed = ComponentPreviewGroupFilterSchema.safeParse(`group:${groupId}`);
  return parsed.success ? parsed.data : "all";
}

export function parseGroupIdFromFilter(
  filter: ComponentPreviewGroupFilter,
): string | null {
  if (filter === "all") {
    return null;
  }
  return filter.slice("group:".length);
}
