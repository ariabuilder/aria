import { describe, expect, it } from "vitest";
import {
  createStageRenderFreshnessTracker,
} from "../../../admin/features/Stage/utils/renderFreshness";

describe("stage render freshness", () => {
  it("rejects an older async render after a newer render starts", () => {
    const tracker = createStageRenderFreshnessTracker();
    const first = tracker.begin("cms-a");
    const second = tracker.begin("cms-a");

    expect(
      tracker.isCurrent(first, {
        cmsRenderKey: "cms-a",
        isCanvasReady: true,
        isUnmounted: false,
      }),
    ).toBe(false);
    expect(
      tracker.isCurrent(second, {
        cmsRenderKey: "cms-a",
        isCanvasReady: true,
        isUnmounted: false,
      }),
    ).toBe(true);
  });

  it("rejects a render when CMS context, readiness, or mount state changes", () => {
    const tracker = createStageRenderFreshnessTracker();
    const snapshot = tracker.begin("cms-a");

    expect(
      tracker.isCurrent(snapshot, {
        cmsRenderKey: "cms-b",
        isCanvasReady: true,
        isUnmounted: false,
      }),
    ).toBe(false);
    expect(
      tracker.isCurrent(snapshot, {
        cmsRenderKey: "cms-a",
        isCanvasReady: false,
        isUnmounted: false,
      }),
    ).toBe(false);
    expect(
      tracker.isCurrent(snapshot, {
        cmsRenderKey: "cms-a",
        isCanvasReady: true,
        isUnmounted: true,
      }),
    ).toBe(false);
  });
});
