/**
 * Aria Motion preset catalog
 */

import type { NodeMotion } from "../../../../../lib/motion/schemas/nodeMotion.schema";
import type { MotionPresetId } from "../../../../../lib/motion/schemas/tokens.schema";
import { DEFAULT_NODE_MOTION } from "../../../../../lib/motion/schemas/nodeMotion.schema";
import { MOTION_PRESET_DEFINITIONS } from "./definitions";

export function getPresetById(id: MotionPresetId) {
  return MOTION_PRESET_DEFINITIONS.find((preset) => preset.id === id);
}

export function applyPreset(
  presetId: MotionPresetId,
  current: NodeMotion = DEFAULT_NODE_MOTION,
): NodeMotion {
  if (presetId === "none") {
    return {
      ...current,
      enabled: false,
      preset: undefined,
      effects: [],
    };
  }

  const preset = getPresetById(presetId);
  if (!preset) {
    return current;
  }

  return {
    ...current,
    enabled: true,
    preset: preset.id,
    effects: [...preset.effects],
    trigger: preset.trigger,
    speed: preset.speed,
    easing: preset.easing,
    distance: preset.distance,
    delay: preset.delay as NodeMotion["delay"],
  };
}

export function mergeModifiers(
  base: NodeMotion,
  overrides: Partial<NodeMotion>,
): NodeMotion {
  return {
    ...base,
    ...overrides,
    effects: overrides.effects ?? base.effects,
    hover: overrides.hover ?? base.hover,
  };
}
