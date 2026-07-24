/**
 * Aria Motion node configuration schema
 */

import { z } from "zod";
import {
  MotionDelayIdSchema,
  MotionDistanceIdSchema,
  MotionEasingIdSchema,
  MotionEffectIdSchema,
  MotionHoverIdSchema,
  MotionLoopIdSchema,
  MotionPresetIdSchema,
  MotionSpeedIdSchema,
  MotionTriggerIdSchema,
} from "./tokens.schema";
import { NodeParallaxSchema } from "./nodeParallax.schema";

export const MotionTextConfigSchema = z
  .object({
    mode: z.enum(["words", "chars"]),
    stagger: z.int().nonnegative().optional(),
    effects: z.array(MotionEffectIdSchema).optional(),
  })
  .strict();

export const MotionScrubConfigSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    travel: z.int().positive().optional(),
  })
  .strict();

export const MotionStaggerConfigSchema = z
  .object({
    interval: z.int().positive(),
  })
  .strict();

export const MotionMagneticConfigSchema = z
  .object({
    strength: z.number().min(0).max(1),
  })
  .strict();

export const NodeMotionSchema = z
  .object({
    enabled: z.boolean(),
    preset: MotionPresetIdSchema.optional(),
    effects: z.array(MotionEffectIdSchema).default([]),
    trigger: MotionTriggerIdSchema.default("reveal"),
    speed: z
      .union([MotionSpeedIdSchema, z.int().positive()])
      .optional(),
    easing: MotionEasingIdSchema.optional(),
    distance: MotionDistanceIdSchema.optional(),
    delay: z
      .union([MotionDelayIdSchema, z.int().nonnegative()])
      .optional(),
    durationVar: z.string().trim().optional(),
    delayVar: z.string().trim().optional(),
    stagger: MotionStaggerConfigSchema.optional(),
    text: MotionTextConfigSchema.optional(),
    hover: z.array(MotionHoverIdSchema).optional(),
    loop: MotionLoopIdSchema.optional(),
    scrub: MotionScrubConfigSchema.optional(),
    magnetic: MotionMagneticConfigSchema.optional(),
    parallax: NodeParallaxSchema.optional(),
  })
  .strict();

export type NodeMotion = z.infer<typeof NodeMotionSchema>;
export type MotionTextConfig = z.infer<typeof MotionTextConfigSchema>;
export type MotionScrubConfig = z.infer<typeof MotionScrubConfigSchema>;
export type MotionStaggerConfig = z.infer<typeof MotionStaggerConfigSchema>;
export type MotionMagneticConfig = z.infer<typeof MotionMagneticConfigSchema>;

export const DEFAULT_NODE_MOTION: NodeMotion = NodeMotionSchema.parse({
  enabled: false,
  effects: [],
  trigger: "reveal",
});
