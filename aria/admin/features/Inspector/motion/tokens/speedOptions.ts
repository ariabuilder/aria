import {
  MOTION_SPEED_IDS,
  type MotionSpeedId,
} from "../../../../../lib/motion/schemas/tokens.schema";

export const MOTION_SPEED_OPTIONS: Array<{ id: MotionSpeedId; label: string }> =
  [
    { id: "instant", label: "Instant" },
    { id: "fast", label: "Fast" },
    { id: "normal", label: "Normal" },
    { id: "slow", label: "Slow" },
    { id: "slower", label: "Slower" },
  ].filter((option) =>
    (MOTION_SPEED_IDS as readonly string[]).includes(option.id),
  ) as Array<{ id: MotionSpeedId; label: string }>;
