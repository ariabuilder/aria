import { describe, expect, it } from "vitest";

import {
  applyToolbarMotionPreset,
  shouldShowToolbarMotionButton,
} from "../../../admin/features/Stage/composables/useSelectionToolbarMotion";
import { DEFAULT_NODE_MOTION } from "../../../lib/motion/schemas/nodeMotion.schema";

describe("selection toolbar motion helpers", () => {
  it("shows only for motion-capable node types", () => {
    expect(shouldShowToolbarMotionButton({ nodeType: "container" })).toBe(true);
    expect(shouldShowToolbarMotionButton({ nodeType: "Heading" })).toBe(true);
    expect(shouldShowToolbarMotionButton({ nodeType: "code" })).toBe(false);
    expect(shouldShowToolbarMotionButton({ nodeType: "slot-header" })).toBe(
      false,
    );
    expect(shouldShowToolbarMotionButton({ nodeType: "" })).toBe(false);
  });

  it("applies presets using the shared motion catalog", () => {
    const motion = applyToolbarMotionPreset(DEFAULT_NODE_MOTION, "fade-up");

    expect(motion.enabled).toBe(true);
    expect(motion.preset).toBe("fade-up");
    expect(motion.effects).toEqual(["fade", "slide-up"]);
    expect(motion.trigger).toBe("reveal");
  });

  it("turns motion off with the none preset", () => {
    const motion = applyToolbarMotionPreset(
      {
        ...applyToolbarMotionPreset(DEFAULT_NODE_MOTION, "fade-up"),
        parallax: {
          enabled: true,
          speed: "1",
          direction: "up",
          effects: [],
          travel: 200,
          anchor: "center",
          velocity: false,
          disableOnMobile: false,
        },
      },
      "none",
    );

    expect(motion.enabled).toBe(false);
    expect(motion.preset).toBeUndefined();
    expect(motion.effects).toEqual([]);
    expect(motion.parallax).toBeUndefined();
  });
});
