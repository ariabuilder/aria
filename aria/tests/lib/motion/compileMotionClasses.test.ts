import { describe, expect, it } from "vitest";

import { compileMotionClasses } from "../../../lib/motion/compile/compileMotionClasses";

describe("compileMotionClasses", () => {
  it("returns empty array when motion is disabled", () => {
    expect(
      compileMotionClasses({
        enabled: false,
        effects: ["fade"],
        trigger: "reveal",
      }),
    ).toEqual([]);
  });

  it("compiles preset entrance classes", () => {
    expect(
      compileMotionClasses({
        enabled: true,
        effects: ["fade", "slide-up"],
        trigger: "reveal",
        speed: "normal",
        easing: "smooth",
        distance: "md",
        delay: "200",
      }),
    ).toEqual([
      "aria-motion",
      "aria-motion-fade",
      "aria-motion-slide-up",
      "aria-motion-reveal",
      "aria-motion-normal",
      "aria-motion-ease-smooth",
      "aria-motion-dist-md",
      "aria-motion-delay-200",
    ]);
  });

  it("includes stagger and hover classes", () => {
    const classes = compileMotionClasses({
      enabled: true,
      effects: ["fade"],
      trigger: "now",
      hover: ["hover-lift"],
      stagger: { interval: 90 },
    });

    expect(classes).toContain("aria-motion-stagger");
    expect(classes).toContain("aria-motion-hover-lift");
    expect(classes).toContain("aria-motion-now");
  });
});
