/**
 * Aria Parallax node configuration schema
 */

import { z } from "zod";
import {
  MotionParallaxSpeedIdSchema,
  MotionParallaxDirectionIdSchema,
  MotionParallaxEasingIdSchema,
  MotionParallaxAnchorIdSchema,
  MotionParallaxEffectIdSchema,
} from "./parallaxTokens.schema";

export const ParallaxEffectConfigSchema = z
  .object({
    effect: MotionParallaxEffectIdSchema,
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

export const ParallaxPinConfigSchema = z
  .object({
    enabled: z.boolean(),
    duration: z.string().optional(),
    offset: z.string().optional(),
  })
  .strict();

export const NodeParallaxSchema = z
  .object({
    enabled: z.boolean(),
    speed: MotionParallaxSpeedIdSchema.default("1"),
    direction: MotionParallaxDirectionIdSchema.default("up"),
    effects: z.array(ParallaxEffectConfigSchema).default([]),
    travel: z.int().nonnegative().default(200),
    easing: MotionParallaxEasingIdSchema.optional(),
    anchor: MotionParallaxAnchorIdSchema.default("center"),
    startOffset: z.string().optional(),
    endOffset: z.string().optional(),
    containerRef: z.string().optional(),
    pin: ParallaxPinConfigSchema.optional(),
    layerGroup: z.string().trim().optional(),
    velocity: z.boolean().default(false),
    disableOnMobile: z.boolean().default(false),
  })
  .strict();

export type NodeParallax = z.infer<typeof NodeParallaxSchema>;
export type ParallaxEffectConfig = z.infer<typeof ParallaxEffectConfigSchema>;
export type ParallaxPinConfig = z.infer<typeof ParallaxPinConfigSchema>;

export const DEFAULT_NODE_PARALLAX: NodeParallax = NodeParallaxSchema.parse({
  enabled: false,
  speed: "1",
  direction: "up",
  effects: [],
  travel: 200,
  anchor: "center",
  velocity: false,
  disableOnMobile: false,
});
