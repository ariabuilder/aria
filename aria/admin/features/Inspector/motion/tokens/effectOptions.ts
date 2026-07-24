/**
 * Aria Motion effect token options
 */

import {
  MOTION_EFFECT_IDS,
  type MotionEffectId,
} from "../../../../../lib/motion/schemas/tokens.schema";

export const MOTION_EFFECT_OPTIONS: Array<{
  id: MotionEffectId;
  label: string;
}> = MOTION_EFFECT_IDS.map((id) => ({
  id,
  label: id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" "),
}));
