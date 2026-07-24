import { z } from "zod";
import { BuilderNodeSchema } from "../../../../../lib/schemas/nodes";
import { JsonObjectSchema } from "../../../../../lib/schemas/json";

export const LibraryElementExposeSchema = z.object({
  elementMeta: z
    .object({
      type: z.string().trim().min(1),
    })
    .optional(),
  elementData: JsonObjectSchema.optional(),
});

export const LibraryDragPayloadSchema = JsonObjectSchema.and(
  z.object({
    type: z.string().trim().min(1),
  }),
);

export const CanvasDropZoneSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().optional(),
});

export const CanvasDropDetailSchema = z
  .object({
    zone: CanvasDropZoneSchema,
    data: LibraryDragPayloadSchema,
    insertionIndex: z.int().min(0),
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .strict();

export type CanvasDropDetail = z.infer<typeof CanvasDropDetailSchema>;
export type LibraryDragPayload = z.infer<typeof LibraryDragPayloadSchema>;

export const ViewportRectSchema = z
  .object({
    left: z.number(),
    top: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .strict();

export const AddElementsInsertionDetailSchema = z
  .object({
    visible: z.boolean(),
    dropParentId: z.string().trim().min(1),
    insertionIndex: z.int().min(0),
    gapViewport: ViewportRectSchema,
    targetViewport: ViewportRectSchema.optional(),
    orientation: z.enum(["horizontal", "vertical"]).optional(),
  })
  .strict();

export type AddElementsInsertionDetail = z.infer<
  typeof AddElementsInsertionDetailSchema
>;

export const AddElementPayloadSchema = z.object({
  type: z.string().min(1),
  data: JsonObjectSchema,
  componentSlug: z.string().min(1).optional(),
  parentId: z.string().trim().min(1).optional(),
  insertionMode: z.enum(["contextual", "root", "parent"]).optional(),
  position: z.int().min(0).optional(),
}).superRefine((payload, ctx) => {
  if (payload.insertionMode === "parent" && !payload.parentId) {
    ctx.addIssue({
      code: "custom",
      path: ["parentId"],
      message: "parentId is required for parent insertion",
    });
  }
});

export const DropComponentPayloadSchema = z
  .object({
    source: z.string().trim().min(1),
    componentType: z.string().trim().min(1),
    componentData: JsonObjectSchema,
    slot: z.string().trim().min(1).optional(),
    position: z.int().min(0).optional(),
    componentSlug: z.string().trim().min(1).optional(),
  })
  .strict();

export const ReorderNodePayloadSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    targetNodeId: z.string().trim().min(1).optional(),
    fromSlot: z.string().trim().min(1).optional(),
    toSlot: z.string().trim().min(1).optional(),
    position: z.int().min(0).optional(),
    show: z.boolean().optional(),
  })
  .strict();

export const NodeIdInputSchema = z.object({
  nodeId: z.string().min(1),
});

export const PasteTargetInputSchema = z.object({
  targetNodeId: z.string().min(1),
});

export const GetItemNodesSchema = z.object({
  nodes: z.array(BuilderNodeSchema).optional(),
});
