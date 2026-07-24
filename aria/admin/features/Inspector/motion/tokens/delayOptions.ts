import {
  MOTION_DELAY_IDS,
  type MotionDelayId,
} from "../../../../../lib/motion/schemas/tokens.schema";

export const MOTION_DELAY_OPTIONS: Array<{ id: MotionDelayId; label: string }> =
  [
    { id: "0", label: "None" },
    { id: "100", label: "100ms" },
    { id: "200", label: "200ms" },
    { id: "300", label: "300ms" },
    { id: "500", label: "500ms" },
    { id: "700", label: "700ms" },
    { id: "1000", label: "1000ms" },
  ].filter((option) =>
    (MOTION_DELAY_IDS as readonly string[]).includes(option.id),
  ) as Array<{ id: MotionDelayId; label: string }>;
