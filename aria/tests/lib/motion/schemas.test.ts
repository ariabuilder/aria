import { describe, expect, it } from "vitest";

import {
  DEFAULT_NODE_MOTION,
  NodeMotionSchema,
} from "../../../lib/motion/schemas/nodeMotion.schema";
import { MotionPresetDefinitionSchema } from "../../../lib/motion/schemas/preset.schema";

describe("Aria Motion schemas", () => {
  it("parses default node motion", () => {
    expect(NodeMotionSchema.parse(DEFAULT_NODE_MOTION)).toEqual({
      enabled: false,
      effects: [],
      trigger: "reveal",
    });
  });

  it("parses enabled motion with modifiers", () => {
    const parsed = NodeMotionSchema.parse({
      enabled: true,
      effects: ["fade", "slide-up"],
      trigger: "reveal",
      speed: "fast",
      easing: "spring",
      distance: "lg",
      delay: "200",
    });

    expect(parsed.enabled).toBe(true);
    expect(parsed.effects).toEqual(["fade", "slide-up"]);
    expect(parsed.speed).toBe("fast");
  });

  it("rejects unknown effect ids", () => {
    const result = NodeMotionSchema.safeParse({
      enabled: true,
      effects: ["not-real"],
      trigger: "reveal",
    });

    expect(result.success).toBe(false);
  });

  it("validates preset definitions", () => {
    const preset = MotionPresetDefinitionSchema.parse({
      id: "fade-in",
      label: "Fade In",
      effects: ["fade"],
      trigger: "reveal",
      speed: "normal",
      easing: "smooth",
      distance: "md",
    });

    expect(preset.id).toBe("fade-in");
  });
});
