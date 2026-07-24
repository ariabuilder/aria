/**
 * Aria Motion token schemas
 */

import { z } from "zod";

export const MOTION_EFFECT_IDS = [
  "fade",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "zoom-in",
  "zoom-out",
  "blur",
  "rotate-in",
  "flip-up",
  "flip-down",
  "flip-left",
  "flip-right",
  "mask-up",
  "mask-down",
  "mask-left",
  "mask-right",
] as const;

export const MOTION_TRIGGER_IDS = [
  "reveal",
  "now",
  "hover",
  "click",
  "scrub",
] as const;

export const MOTION_SPEED_IDS = [
  "instant",
  "fast",
  "normal",
  "slow",
  "slower",
] as const;

export const MOTION_EASING_IDS = [
  "smooth",
  "spring",
  "linear",
  "in",
  "out",
  "in-out",
] as const;

export const MOTION_DISTANCE_IDS = ["sm", "md", "lg", "xl"] as const;

export const MOTION_DELAY_IDS = [
  "0",
  "100",
  "200",
  "300",
  "500",
  "700",
  "1000",
] as const;

export const MOTION_HOVER_IDS = [
  "hover-lift",
  "hover-grow",
  "hover-shrink",
  "hover-rotate",
  "hover-tilt",
  "hover-glow",
  "hover-float",
  "hover-pop",
  "hover-press",
  "hover-underline",
  "hover-sweep",
  "hover-border",
] as const;

export const MOTION_LOOP_IDS = [
  "pulse",
  "heartbeat",
  "float",
  "spin",
  "ping",
  "flash",
  "bounce",
  "shake",
  "wobble",
  "jello",
  "vibrate",
  "swing",
  "rubber",
  "tada",
] as const;

export const MOTION_PRESET_IDS = [
  "none",
  "fade-in",
  "fade-up",
  "fade-down",
  "slide-left",
  "slide-right",
  "zoom-in",
  "blur-in",
  "mask-up",
  "on-load",
  "pop-in",
  "gentle-rise",
  "tilt-in",
] as const;

export const MotionEffectIdSchema = z.enum(MOTION_EFFECT_IDS);
export const MotionTriggerIdSchema = z.enum(MOTION_TRIGGER_IDS);
export const MotionSpeedIdSchema = z.enum(MOTION_SPEED_IDS);
export const MotionEasingIdSchema = z.enum(MOTION_EASING_IDS);
export const MotionDistanceIdSchema = z.enum(MOTION_DISTANCE_IDS);
export const MotionDelayIdSchema = z.enum(MOTION_DELAY_IDS);
export const MotionHoverIdSchema = z.enum(MOTION_HOVER_IDS);
export const MotionLoopIdSchema = z.enum(MOTION_LOOP_IDS);
export const MotionPresetIdSchema = z.enum(MOTION_PRESET_IDS);

export type MotionEffectId = z.infer<typeof MotionEffectIdSchema>;
export type MotionTriggerId = z.infer<typeof MotionTriggerIdSchema>;
export type MotionSpeedId = z.infer<typeof MotionSpeedIdSchema>;
export type MotionEasingId = z.infer<typeof MotionEasingIdSchema>;
export type MotionDistanceId = z.infer<typeof MotionDistanceIdSchema>;
export type MotionDelayId = z.infer<typeof MotionDelayIdSchema>;
export type MotionHoverId = z.infer<typeof MotionHoverIdSchema>;
export type MotionLoopId = z.infer<typeof MotionLoopIdSchema>;
export type MotionPresetId = z.infer<typeof MotionPresetIdSchema>;
