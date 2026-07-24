import {
  MOTION_LOOP_IDS,
  type MotionLoopId,
} from "../../../../../lib/motion/schemas/tokens.schema";

export const MOTION_LOOP_OPTIONS: Array<{ id: MotionLoopId; label: string }> =
  MOTION_LOOP_IDS.map((id) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
  }));
