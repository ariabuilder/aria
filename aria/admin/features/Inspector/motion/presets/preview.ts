/**
 * Compile Aria Motion classes for preset card previews Uses the same preset → motion
 * → class pipeline as the canvas, but strips trigger classes so the inspector.
 */

import { studioIcons } from "@/lib/icons";
import { compileMotionClasses } from "../../../../../lib/motion/compile/compileMotionClasses";
import type { MotionPresetDefinition } from "../../../../../lib/motion/schemas/preset.schema";
import type { MotionPresetId } from "../../../../../lib/motion/schemas/tokens.schema";
import { applyPreset } from "./catalog";

const PREVIEW_EXCLUDED_TRIGGER_CLASSES = new Set([
  "aria-motion-reveal",
  "aria-motion-now",
  "aria-motion-hover",
  "aria-motion-click",
  "aria-motion-scrub",
]);

export type PresetPreviewVisual =
  | { shape: "block" }
  | { shape: "icon"; icon: string };

const PRESET_VISUAL_BY_ID: Record<MotionPresetId, PresetPreviewVisual> = {
  none: { shape: "block" },
  "fade-in": { shape: "icon", icon: studioIcons.sunFog },
  "fade-up": { shape: "icon", icon: studioIcons.arrowUp },
  "fade-down": { shape: "icon", icon: studioIcons.arrowDown },
  "slide-left": { shape: "icon", icon: studioIcons.arrowLeft },
  "slide-right": { shape: "icon", icon: studioIcons.arrowRight },
  "zoom-in": { shape: "icon", icon: studioIcons.magnifier },
  "blur-in": { shape: "icon", icon: studioIcons.blur },
  "mask-up": { shape: "block" },
  "on-load": { shape: "icon", icon: studioIcons.play },
  "pop-in": { shape: "icon", icon: studioIcons.sparkles },
  "gentle-rise": { shape: "icon", icon: studioIcons.arrowUp },
  "tilt-in": { shape: "icon", icon: studioIcons.rotateClockwise },
};

export function getPresetPreviewVisual(
  preset: MotionPresetDefinition,
): PresetPreviewVisual {
  return PRESET_VISUAL_BY_ID[preset.id] ?? { shape: "block" };
}

export function compilePresetPreviewClasses(
  preset: MotionPresetDefinition,
): string {
  const motion = applyPreset(preset.id);

  return compileMotionClasses(motion)
    .filter((cls) => !PREVIEW_EXCLUDED_TRIGGER_CLASSES.has(cls))
    .join(" ");
}
