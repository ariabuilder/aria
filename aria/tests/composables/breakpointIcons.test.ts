import { describe, expect, it } from "vitest";

import { getBreakpointIconClass } from "../../admin/composables/breakpointIcons";
import { studioIcons } from "../../admin/lib/icons";

describe("breakpointIcons", () => {
  it("returns the correct icon class for canonical breakpoints", () => {
    expect(getBreakpointIconClass({ id: "base", icon: "Monitor" })).toBe(
      studioIcons.monitor,
    );
    expect(getBreakpointIconClass({ id: "laptop", icon: "Laptop" })).toBe(
      studioIcons.laptop,
    );
    expect(getBreakpointIconClass({ id: "tablet", icon: "Tablet" })).toBe(
      studioIcons.tablet,
    );
    expect(getBreakpointIconClass({ id: "mobile", icon: "Smartphone" })).toBe(
      studioIcons.smartphone,
    );
  });
});
