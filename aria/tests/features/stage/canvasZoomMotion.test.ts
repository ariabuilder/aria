import { describe, expect, it } from "vitest";

import {
  computeAnchoredScrollLeft,
  computeWheelZoomDelta,
  easeOutQuad,
} from "../../../admin/features/Stage/composables/canvasZoomMotion";

describe("canvasZoomMotion", () => {
  it("eases out toward 1", () => {
    expect(easeOutQuad(0)).toBe(0);
    expect(easeOutQuad(1)).toBe(1);
    expect(easeOutQuad(0.5)).toBe(0.75);
  });

  it("computes wheel zoom delta from scroll direction", () => {
    expect(computeWheelZoomDelta(-120)).toBeGreaterThan(0);
    expect(computeWheelZoomDelta(120)).toBeLessThan(0);
    expect(computeWheelZoomDelta(0)).toBe(-1);
  });

  it("anchors scroll position under cursor after width change", () => {
    const nextScrollLeft = computeAnchoredScrollLeft(400, 2000, 100, 2500);

    expect(nextScrollLeft).toBe(525);
  });

  it("preserves scroll when widths are invalid", () => {
    expect(computeAnchoredScrollLeft(100, 0, 50, 1000)).toBe(100);
  });
});
