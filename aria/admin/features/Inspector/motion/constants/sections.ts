/**
 * Aria Motion section identifiers
 */

export const MOTION_SECTION_IDS = [
  "enable",
  "presets",
  "effects",
  "trigger",
  "timing",
  "text",
  "hover",
  "loop",
  "stagger",
  "parallax",
] as const;

export type MotionSectionId = (typeof MOTION_SECTION_IDS)[number];

export const MOTION_SECTION_ORDER: MotionSectionId[] = [
  "enable",
  "presets",
  "effects",
  "trigger",
  "timing",
  "text",
  "hover",
  "loop",
  "stagger",
  "parallax",
];

export const MOTION_SECTION_LABELS: Record<MotionSectionId, string> = {
  enable: "Aria Motion",
  presets: "Presets",
  effects: "Effects",
  trigger: "Trigger",
  timing: "Timing",
  text: "Text Motion",
  hover: "Hover",
  loop: "Loop",
  stagger: "Stagger Children",
  parallax: "Parallax Scroll",
};
