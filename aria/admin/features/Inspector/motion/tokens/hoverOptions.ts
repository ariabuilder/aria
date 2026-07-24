import {
  MOTION_HOVER_IDS,
  type MotionHoverId,
} from "../../../../../lib/motion/schemas/tokens.schema";

export const MOTION_HOVER_OPTIONS: Array<{ id: MotionHoverId; label: string }> =
  MOTION_HOVER_IDS.map((id) => ({
    id,
    label: id
      .replace("hover-", "")
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
  }));
