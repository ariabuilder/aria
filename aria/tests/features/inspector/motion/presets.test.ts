import { describe, expect, it } from "vitest";

import { MOTION_PRESET_DEFINITIONS } from "../../../../admin/features/Inspector/motion/presets/definitions";
import { applyPreset, getPresetById } from "../../../../admin/features/Inspector/motion/presets/catalog";

describe("Aria Motion presets", () => {
  it("validates every preset definition", () => {
    expect(MOTION_PRESET_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it("returns preset by id", () => {
    expect(getPresetById("fade-up")?.label).toBe("Rise Up");
  });

  it("applies preset to node motion", () => {
    const motion = applyPreset("fade-up");

    expect(motion.enabled).toBe(true);
    expect(motion.preset).toBe("fade-up");
    expect(motion.effects).toEqual(["fade", "slide-up"]);
    expect(motion.trigger).toBe("reveal");
  });
});
