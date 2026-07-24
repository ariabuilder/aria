import {
  MOTION_DISTANCE_IDS,
  type MotionDistanceId,
} from "../../../../../lib/motion/schemas/tokens.schema";

export const MOTION_DISTANCE_OPTIONS: Array<{
  id: MotionDistanceId;
  label: string;
}> = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Large" },
  { id: "xl", label: "Extra Large" },
].filter((option) =>
  (MOTION_DISTANCE_IDS as readonly string[]).includes(option.id),
) as Array<{ id: MotionDistanceId; label: string }>;
