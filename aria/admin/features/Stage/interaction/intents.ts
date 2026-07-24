import { z } from "zod";
import { FrameViewportPointSchema, FrameViewportRectSchema } from "./geometry";
import { VisualOverlayDescriptorSchema } from "./overlayDescriptors";

export const CanvasInteractionModeSchema = z.enum([
  "idle",
  "hover",
  "selected",
  "libraryDrag",
  "nodeDrag",
  "inlineEdit",
  "marquee",
]);

export type CanvasInteractionMode = z.infer<
  typeof CanvasInteractionModeSchema
>;

export const SelectionIntentSchema = z
  .object({
    nodeId: z.string().trim().min(1).nullable(),
    nodeType: z.string().trim().min(1).optional(),
    source: z.enum(["canvas", "layers", "inspector", "programmatic"]),
    gesture: z
      .object({
        metaKey: z.boolean(),
        ctrlKey: z.boolean(),
        shiftKey: z.boolean(),
      })
      .strict()
      .optional(),
    point: FrameViewportPointSchema.optional(),
  })
  .strict();

export type SelectionIntent = z.infer<typeof SelectionIntentSchema>;

export const DropIntentSchema = z
  .object({
    kind: z.enum(["insert", "move"]),
    source: z.enum(["library", "canvas", "layers"]),
    nodeId: z.string().trim().min(1).optional(),
    parentId: z.string().trim().min(1).nullable(),
    targetNodeId: z.string().trim().min(1).nullable().optional(),
    index: z.int().min(0),
    position: z.enum(["before", "after", "inside"]).optional(),
    point: FrameViewportPointSchema.optional(),
    visualRects: z
      .object({
        insertion: FrameViewportRectSchema.optional(),
        target: FrameViewportRectSchema.optional(),
      })
      .strict()
      .optional(),
    overlays: z.array(VisualOverlayDescriptorSchema).optional(),
  })
  .strict();

export type DropIntent = z.infer<typeof DropIntentSchema>;

export const CanvasMutationIntentSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("select"),
      selection: SelectionIntentSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("drop"),
      drop: DropIntentSchema,
    })
    .strict(),
]);

export type CanvasMutationIntent = z.infer<
  typeof CanvasMutationIntentSchema
>;
