/**
 * Aria Motion type re-exports
 */

export type {
  MotionDelayId,
  MotionDistanceId,
  MotionEasingId,
  MotionEffectId,
  MotionHoverId,
  MotionLoopId,
  MotionPresetId,
  MotionSpeedId,
  MotionTriggerId,
} from "./schemas/tokens.schema";

export type {
  MotionMagneticConfig,
  MotionScrubConfig,
  MotionStaggerConfig,
  MotionTextConfig,
  NodeMotion,
} from "./schemas/nodeMotion.schema";

export type {
  MotionParallaxSpeedId,
  MotionParallaxDirectionId,
  MotionParallaxEasingId,
  MotionParallaxAnchorId,
  MotionParallaxEffectId,
} from "./schemas/parallaxTokens.schema";

export type {
  NodeParallax,
  ParallaxEffectConfig,
  ParallaxPinConfig,
} from "./schemas/nodeParallax.schema";

export type { MotionPresetDefinition } from "./schemas/preset.schema";
