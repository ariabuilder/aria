/**
 * Re-exports UI_PRESETS from the shared lib.
 * LEGACY_PRESETS kept empty for backward compatibility.
 */

import { UI_PRESETS } from "../../../../../lib/motion/presets";
import { MotionPresetDefinitionSchema } from "../../../../../lib/motion/schemas/preset.schema";
import type { MotionPresetDefinition } from "../../../../../lib/motion/schemas/preset.schema";

// Re-export UI presets from shared lib so Inspector consumers can use them
export { UI_PRESETS };

/**
 * Legacy presets — kept for nodes saved before the shared lib migration.
 * Empty because all presets are now in the shared UI_PRESETS.
 */
const LEGACY_PRESETS: MotionPresetDefinition[] = [];

export const MOTION_PRESET_UI_DEFINITIONS: MotionPresetDefinition[] =
  UI_PRESETS.map((preset) => MotionPresetDefinitionSchema.parse(preset));

export const MOTION_PRESET_DEFINITIONS: MotionPresetDefinition[] = [
  ...UI_PRESETS,
  ...LEGACY_PRESETS,
].map((preset) => MotionPresetDefinitionSchema.parse(preset));
