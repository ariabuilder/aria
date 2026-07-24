import { describe, expect, it } from "vitest";

import {
  GetAllClassesResponseSchema,
  UpdateClassPseudoRuleInputSchema,
  authoringModeToFrameworkMode,
  frameworkModeToAuthoringMode,
} from "../../lib/schemas/classEditor";

describe("classEditor schema helpers", () => {
  it("maps compatibility framework modes into canonical authoring modes", () => {
    expect(frameworkModeToAuthoringMode("unocss")).toBe("utility");
    expect(frameworkModeToAuthoringMode("custom")).toBe("semantic");
    expect(authoringModeToFrameworkMode("utility")).toBe("unocss");
    expect(authoringModeToFrameworkMode("semantic")).toBe("custom");
    expect(authoringModeToFrameworkMode("hybrid")).toBe("unocss");
  });

  it("accepts get-classes payloads centered on canonical authoring mode", () => {
    const parsed = GetAllClassesResponseSchema.parse({
      success: true,
      classes: {},
      authoringMode: "hybrid",
      css: ".button{}",
    });

    expect(parsed.authoringMode).toBe("hybrid");
    expect(parsed.css).toBe(".button{}");
  });

  it("accepts custom relational pseudo states in updateClassPseudoRule input", () => {
    const parsed = UpdateClassPseudoRuleInputSchema.parse({
      className: "card",
      state: "custom:has(.icon)",
      breakpoint: "base",
      property: "gap",
      value: "0.5rem",
      important: false,
    });

    expect(parsed.state).toBe("custom:has(.icon)");
  });

  it("rejects invalid pseudo states at the action input boundary", () => {
    expect(
      UpdateClassPseudoRuleInputSchema.safeParse({
        className: "card",
        state: "not-a-real-pseudo",
        breakpoint: "base",
        property: "gap",
        value: "0.5rem",
      }).success,
    ).toBe(false);
  });
});
