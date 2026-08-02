import { describe, expect, it } from "vitest";

import { CanvasAffordanceDescriptorSchema } from "../../../lib/rendering/canonical";
import { resolveCanvasAffordanceVisualLayout } from "../../../admin/features/Stage/utils/canvasAffordanceLayout";

describe("resolveCanvasAffordanceVisualLayout", () => {
  it("centers a collapsed nested hit rail on the authored zero-height anchor", () => {
    const descriptor = CanvasAffordanceDescriptorSchema.parse({
      kind: "empty-node",
      nodeId: "container-1",
      nodeType: "container",
      position: { left: 100, top: 80, width: 600, height: 0 },
      presentation: "collapsed-rail",
      depth: 1,
    });

    expect(resolveCanvasAffordanceVisualLayout(descriptor)).toEqual({
      left: 112,
      top: 68,
      width: 588,
      height: 24,
      collapsed: true,
    });
  });

  it("keeps regular affordance boxes on their authored geometry", () => {
    const descriptor = CanvasAffordanceDescriptorSchema.parse({
      kind: "missing-media",
      nodeId: "image-1",
      nodeType: "image",
      position: { left: 24, top: 32, width: 160, height: 90 },
      presentation: "box",
      depth: 2,
    });

    expect(resolveCanvasAffordanceVisualLayout(descriptor)).toEqual({
      left: 24,
      top: 32,
      width: 160,
      height: 90,
      collapsed: false,
    });
  });

  it("keeps a zero-width collapsed target usable without negative width", () => {
    const descriptor = CanvasAffordanceDescriptorSchema.parse({
      kind: "empty-component",
      nodeId: "component-1",
      nodeType: "component",
      position: { left: 16, top: 20, width: 0, height: 0 },
      presentation: "collapsed-rail",
      depth: 8,
    });

    expect(resolveCanvasAffordanceVisualLayout(descriptor)).toEqual({
      left: 16,
      top: 8,
      width: 24,
      height: 24,
      collapsed: true,
    });
  });
});
