import {
  MOTION_EASING_IDS,
  type MotionEasingId,
} from "../../../../../lib/motion/schemas/tokens.schema";

export const MOTION_EASING_OPTIONS: Array<{
  id: MotionEasingId;
  label: string;
}> = [
  { id: "smooth", label: "Smooth" },
  { id: "spring", label: "Spring" },
  { id: "linear", label: "Linear" },
  { id: "in", label: "Ease In" },
  { id: "out", label: "Ease Out" },
  { id: "in-out", label: "Ease In Out" },
].filter((option) =>
  (MOTION_EASING_IDS as readonly string[]).includes(option.id),
) as Array<{ id: MotionEasingId; label: string }>;
