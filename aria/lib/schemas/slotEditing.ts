/**
 * Zod schemas for layout slot editing mode (active slot, mutations, snapshots).
 */

import { z } from "zod";
import { BuilderNodeSchema } from "./nodes";

export const LayoutSlotScopeSchema = z.enum(["page", "layout"]);

export type LayoutSlotScope = z.infer<typeof LayoutSlotScopeSchema>;

export const ActiveLayoutSlotSchema = z
  .object({
    name: z.string().trim().min(1),
    scope: LayoutSlotScopeSchema,
    layoutId: z.string().trim().min(1).optional(),
  })
  .strict();

export type ActiveLayoutSlot = z.infer<typeof ActiveLayoutSlotSchema>;

export const UpdateLayoutSlotContentInputSchema = z
  .object({
    layoutSlug: z.string().trim().min(1),
    slotName: z.string().trim().min(1),
    nodes: z.array(BuilderNodeSchema),
    expectedVersion: z.string().trim().min(1).optional(),
  })
  .strict();

export type UpdateLayoutSlotContentInput = z.infer<
  typeof UpdateLayoutSlotContentInputSchema
>;

export const UpdateLayoutSlotContentResultSchema = z
  .object({
    success: z.literal(true),
    version: z.string().min(1),
    layoutId: z.string().min(1),
    slotName: z.string().min(1),
  })
  .strict();

export type UpdateLayoutSlotContentResult = z.infer<
  typeof UpdateLayoutSlotContentResultSchema
>;

/** Canonical slot definition list for dirty snapshots (order-sensitive). */
export const LayoutSlotSnapshotEntrySchema = z
  .object({
    name: z.string().min(1),
    defaultContent: z.array(BuilderNodeSchema).optional(),
  })
  .strict();

export const LayoutSlotsSnapshotSchema = z.array(
  LayoutSlotSnapshotEntrySchema,
);

export type LayoutSlotsSnapshot = z.infer<typeof LayoutSlotsSnapshotSchema>;

export const SlotEditingToastPayloadSchema = z
  .object({
    slotLabel: z.string().trim().min(1),
  })
  .strict();

export type SlotEditingToastPayload = z.infer<
  typeof SlotEditingToastPayloadSchema
>;

export const SlotMutationTargetSchema = z.discriminatedUnion("collection", [
  z
    .object({
      collection: z.literal("pages"),
      id: z.string().trim().min(1),
      rootSlotName: z.string().trim().min(1),
      parentId: z.string().trim().min(1).nullable(),
    })
    .strict(),
  z
    .object({
      collection: z.literal("layouts"),
      id: z.string().trim().min(1),
      slotName: z.string().trim().min(1),
      parentId: z.string().trim().min(1).nullable(),
    })
    .strict(),
]);

export type SlotMutationTarget = z.infer<typeof SlotMutationTargetSchema>;
