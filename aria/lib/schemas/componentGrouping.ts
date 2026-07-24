import { z } from "zod";

export const ComponentGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
});

export const ComponentGroupingStateSchema = z.object({
  groups: z.array(ComponentGroupSchema),
  assignments: z.record(z.string(), z.string()),
});

export const ComponentGroupingResponseSchema = z.object({
  success: z.literal(true),
  data: ComponentGroupingStateSchema,
});

export type ComponentGroup = z.infer<typeof ComponentGroupSchema>;
export type ComponentGroupingState = z.infer<typeof ComponentGroupingStateSchema>;
