import {
  MOTION_TRIGGER_IDS,
  type MotionTriggerId,
} from "../../../../../lib/motion/schemas/tokens.schema";

export const MOTION_TRIGGER_OPTIONS: Array<{
  id: MotionTriggerId;
  label: string;
}> = [
  { id: "reveal", label: "Scroll Reveal" },
  { id: "now", label: "On Load" },
  { id: "hover", label: "Hover" },
  { id: "click", label: "Click" },
  { id: "scrub", label: "Scroll Scrub" },
].filter((option) =>
  (MOTION_TRIGGER_IDS as readonly string[]).includes(option.id),
) as Array<{ id: MotionTriggerId; label: string }>;
