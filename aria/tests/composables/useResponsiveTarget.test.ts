import { beforeEach, describe, expect, it } from "vitest";

import { useResponsiveTarget } from "../../admin/composables/useResponsiveTarget";
import { useViewport } from "../../admin/composables/useViewport";

describe("useResponsiveTarget", () => {
  beforeEach(() => {
    localStorage.clear();
    const responsiveTarget = useResponsiveTarget();
    responsiveTarget.clearTargetBreakpoint();
  });

  it("defaults to base targeting", () => {
    const responsiveTarget = useResponsiveTarget();

    expect(responsiveTarget.targetBreakpoint.value).toBe("base");
    expect(responsiveTarget.isBaseTarget.value).toBe(true);
    expect(responsiveTarget.hasOverrideTarget.value).toBe(false);
  });

  it("toggles an override target on and off", () => {
    const responsiveTarget = useResponsiveTarget();

    responsiveTarget.toggleTargetBreakpoint("tablet");
    expect(responsiveTarget.targetBreakpoint.value).toBe("tablet");
    expect(responsiveTarget.hasOverrideTarget.value).toBe(true);

    responsiveTarget.toggleTargetBreakpoint("tablet");
    expect(responsiveTarget.targetBreakpoint.value).toBe("base");
    expect(responsiveTarget.hasOverrideTarget.value).toBe(false);
  });

  it("normalizes desktop/default aliases back to base", () => {
    const responsiveTarget = useResponsiveTarget();

    responsiveTarget.setTargetBreakpoint("desktop");
    expect(responsiveTarget.targetBreakpoint.value).toBe("base");

    responsiveTarget.setTargetBreakpoint("default");
    expect(responsiveTarget.targetBreakpoint.value).toBe("base");
  });

  it("mirrors viewport selection as the active target", () => {
    const responsiveTarget = useResponsiveTarget();
    const { setViewport } = useViewport();

    setViewport("tablet");
    expect(responsiveTarget.targetBreakpoint.value).toBe("tablet");
    expect(responsiveTarget.hasOverrideTarget.value).toBe(true);

    setViewport("desktop");
    expect(responsiveTarget.targetBreakpoint.value).toBe("base");
    expect(responsiveTarget.isBaseTarget.value).toBe(true);
  });
});
