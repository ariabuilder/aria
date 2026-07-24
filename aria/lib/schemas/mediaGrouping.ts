import { z } from "zod";

export const MediaGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
});

export const MediaGroupingStateSchema = z.object({
  groups: z.array(MediaGroupSchema),
  assignments: z.record(z.string(), z.string()),
});

export const MediaGroupingResponseSchema = z.object({
  success: z.literal(true),
  data: MediaGroupingStateSchema,
});

export type MediaGroup = z.infer<typeof MediaGroupSchema>;
export type MediaGroupingState = z.infer<typeof MediaGroupingStateSchema>;
