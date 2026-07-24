/**
 * Aria Motion UI presets — shared between Inspector
 * and Agent. Validated at module load via MotionPresetDefinitionSchema.
 */

import { MotionPresetDefinitionSchema } from "./schemas/preset.schema";
import type { MotionPresetDefinition } from "./schemas/preset.schema";

export const UI_PRESETS: MotionPresetDefinition[] = [
  {
    id: "fade-in",
    label: "Fade In",
    effects: ["fade"],
    trigger: "reveal",
    speed: "normal",
    easing: "smooth",
    distance: "md",
  },
  {
    id: "fade-up",
    label: "Rise Up",
    effects: ["fade", "slide-up"],
    trigger: "reveal",
    speed: "normal",
    easing: "smooth",
    distance: "md",
  },
  {
    id: "gentle-rise",
    label: "Gentle Rise",
    effects: ["fade", "slide-up"],
    trigger: "reveal",
    speed: "slow",
    easing: "smooth",
    distance: "sm",
  },
  {
    id: "slide-left",
    label: "Slide Left",
    effects: ["fade", "slide-left"],
    trigger: "reveal",
    speed: "normal",
    easing: "smooth",
    distance: "md",
  },
  {
    id: "fade-down",
    label: "Drop In",
    effects: ["fade", "slide-down"],
    trigger: "reveal",
    speed: "normal",
    easing: "smooth",
    distance: "md",
  },
  {
    id: "slide-right",
    label: "Slide Right",
    effects: ["fade", "slide-right"],
    trigger: "reveal",
    speed: "normal",
    easing: "smooth",
    distance: "md",
  },
  {
    id: "on-load",
    label: "On Load",
    effects: ["fade", "slide-up"],
    trigger: "now",
    speed: "fast",
    easing: "smooth",
    distance: "sm",
  },
  {
    id: "zoom-in",
    label: "Zoom In",
    effects: ["fade", "zoom-in"],
    trigger: "reveal",
    speed: "normal",
    easing: "smooth",
    distance: "md",
  },
  {
    id: "pop-in",
    label: "Pop In",
    effects: ["fade", "zoom-in"],
    trigger: "reveal",
    speed: "fast",
    easing: "spring",
    distance: "sm",
  },
  // Filter & transform
  {
    id: "blur-in",
    label: "Soft Reveal",
    effects: ["fade", "blur"],
    trigger: "reveal",
    speed: "slow",
    easing: "smooth",
    distance: "md",
  },
  {
    id: "tilt-in",
    label: "Tilt In",
    effects: ["fade", "rotate-in"],
    trigger: "reveal",
    speed: "normal",
    easing: "spring",
    distance: "md",
  },
  {
    id: "mask-up",
    label: "Mask Up",
    effects: ["mask-up"],
    trigger: "reveal",
    speed: "normal",
    easing: "smooth",
    distance: "md",
  },
].map((p) => MotionPresetDefinitionSchema.parse(p));
