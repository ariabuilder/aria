/**
 * Aria Motion preset definition schema
 */

import { z } from "zod";
import {
  MotionDistanceIdSchema,
  MotionEasingIdSchema,
  MotionEffectIdSchema,
  MotionPresetIdSchema,
  MotionSpeedIdSchema,
  MotionTriggerIdSchema,
} from "./tokens.schema";

export const MotionPresetDefinitionSchema = z
  .object({
    id: MotionPresetIdSchema,
    label: z.string().trim().min(1),
    description: z.string().trim().optional(),
    effects: z.array(MotionEffectIdSchema).default([]),
    trigger: MotionTriggerIdSchema.default("reveal"),
    speed: MotionSpeedIdSchema.default("normal"),
    easing: MotionEasingIdSchema.default("smooth"),
    distance: MotionDistanceIdSchema.default("md"),
    delay: z.string().optional(),
  })
  .strict();

export type MotionPresetDefinition = z.infer<
  typeof MotionPresetDefinitionSchema
>;
