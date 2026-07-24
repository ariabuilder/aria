/**
 * Aria Parallax token schemas
 */

import { z } from "zod";

export const MOTION_PARALLAX_SPEED_IDS = [
  "0",
  "0.25",
  "0.5",
  "0.75",
  "1",
  "1.25",
  "1.5",
  "2",
] as const;

export const MOTION_PARALLAX_DIRECTION_IDS = [
  "up",
  "down",
  "left",
  "right",
] as const;

export const MOTION_PARALLAX_EASING_IDS = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "spring",
] as const;

export const MOTION_PARALLAX_ANCHOR_IDS = ["top", "center", "bottom"] as const;

export const MOTION_PARALLAX_EFFECT_IDS = [
  "translate",
  "opacity",
  "blur",
  "scale",
  "rotate",
] as const;

export const MotionParallaxSpeedIdSchema = z.enum(MOTION_PARALLAX_SPEED_IDS);
export const MotionParallaxDirectionIdSchema = z.enum(
  MOTION_PARALLAX_DIRECTION_IDS,
);
export const MotionParallaxEasingIdSchema = z.enum(MOTION_PARALLAX_EASING_IDS);
export const MotionParallaxAnchorIdSchema = z.enum(MOTION_PARALLAX_ANCHOR_IDS);
export const MotionParallaxEffectIdSchema = z.enum(MOTION_PARALLAX_EFFECT_IDS);

export type MotionParallaxSpeedId = z.infer<typeof MotionParallaxSpeedIdSchema>;
export type MotionParallaxDirectionId = z.infer<
  typeof MotionParallaxDirectionIdSchema
>;
export type MotionParallaxEasingId = z.infer<
  typeof MotionParallaxEasingIdSchema
>;
export type MotionParallaxAnchorId = z.infer<
  typeof MotionParallaxAnchorIdSchema
>;
export type MotionParallaxEffectId = z.infer<
  typeof MotionParallaxEffectIdSchema
>;
