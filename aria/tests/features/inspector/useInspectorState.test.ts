import { beforeEach, describe, expect, it } from "vitest";

import { useInspectorState } from "../../../admin/features/Inspector/composables/useInspectorState";

describe("useInspectorState", () => {
  beforeEach(() => {
    const state = useInspectorState();
    state.reset();
  });

  it("focusMotionInDesign switches to motion and increments motionFocusNonce", () => {
    const state = useInspectorState();

    state.setTab("props");
    state.focusMotionInDesign();

    expect(state.activeTab.value).toBe("motion");
    expect(state.motionFocusNonce.value).toBe(1);

    state.focusMotionInDesign();
    expect(state.motionFocusNonce.value).toBe(2);
  });

  it("includes motion in tab navigation order", () => {
    const state = useInspectorState();

    state.setTab("design");
    expect(state.getNextTab()).toBe("props");

    state.setTab("props");
    expect(state.getNextTab()).toBe("motion");
    expect(state.getPreviousTab()).toBe("design");
  });
});
