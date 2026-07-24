import { z } from "zod";
import { ActorRefSchema } from "../auth/types";

export const GetComponentVersionsInputSchema = z.object({
  componentId: z.string().trim().min(1),
});

export const ComponentVersionEntrySchema = z.object({
  version: z.string(),
  createdAt: z.string(),
  createdBy: ActorRefSchema.optional(),
});

export const GetComponentVersionsOutputSchema = z.object({
  versions: z.array(ComponentVersionEntrySchema),
});

export type GetComponentVersionsInput = z.infer<
  typeof GetComponentVersionsInputSchema
>;
export type ComponentVersionEntry = z.infer<typeof ComponentVersionEntrySchema>;
export type GetComponentVersionsOutput = z.infer<
  typeof GetComponentVersionsOutputSchema
>;
