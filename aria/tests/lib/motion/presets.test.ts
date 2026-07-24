import { describe, expect, it } from "vitest";
import { UI_PRESETS } from "../../../lib/motion/presets";
import { MotionPresetDefinitionSchema } from "../../../lib/motion/schemas/preset.schema";

describe("motion presets", () => {
  it("all UI presets parse with Zod", () => {
    for (const preset of UI_PRESETS) {
      expect(() => MotionPresetDefinitionSchema.parse(preset)).not.toThrow();
    }
  });

  it("includes expected presets", () => {
    const ids = UI_PRESETS.map((p) => p.id);
    expect(ids).toContain("fade-in");
    expect(ids).toContain("fade-up");
    expect(ids).toContain("pop-in");
  });
});
