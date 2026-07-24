import { z } from "zod";

export const LayoutMetadataSlotSchema = z.object({
  name: z.string().min(1),
  required: z.boolean(),
});

export const LayoutInspectorMetadataSchema = z.object({
  layoutType: z.string().optional(),
  slots: z.array(LayoutMetadataSlotSchema).optional(),
  description: z.string().optional(),
});

export type LayoutMetadataSlot = z.infer<typeof LayoutMetadataSlotSchema>;
export type LayoutInspectorMetadata = z.infer<
  typeof LayoutInspectorMetadataSchema
>;