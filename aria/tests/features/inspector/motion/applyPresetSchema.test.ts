import { describe, expect, it } from "vitest";

import { applyPreset } from "../../../../admin/features/Inspector/motion/presets/catalog";
import { MOTION_PRESET_DEFINITIONS } from "../../../../admin/features/Inspector/motion/presets/definitions";
import { NodeMotionSchema } from "../../../../lib/motion/schemas/nodeMotion.schema";

describe("applyPreset schema", () => {
  it("every preset produces valid NodeMotion", () => {
    for (const preset of MOTION_PRESET_DEFINITIONS) {
      const motion = applyPreset(preset.id);
      const parsed = NodeMotionSchema.safeParse(motion);
      expect(parsed.success, preset.id).toBe(true);
    }
  });
});
