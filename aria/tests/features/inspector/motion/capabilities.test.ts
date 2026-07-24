import { describe, expect, it } from "vitest";

import {
  getVisibleMotionSections,
  nodeSupportsMotion,
} from "../../../../admin/features/Inspector/motion/constants/capabilityRules";

describe("Aria Motion capabilities", () => {
  it("gates sections by node type", () => {
    expect(getVisibleMotionSections("heading", true)).toContain("text");
    expect(getVisibleMotionSections("container", true)).toContain("stagger");
    expect(getVisibleMotionSections("heading", false)).toEqual(["enable"]);
  });

  it("disables motion for code nodes", () => {
    expect(nodeSupportsMotion("code")).toBe(false);
    expect(nodeSupportsMotion("Container")).toBe(true);
  });
});
