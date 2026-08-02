import { describe, expect, it } from "vitest";

import {
  BrowserParityFixtureSchema,
  BrowserParityRuntimeHostResultSchema,
  BrowserParitySurfaceSnapshotSchema,
  CanvasAffordanceDescriptorSchema,
  EditorCaptureEventSchema,
  PHASE_2_EDITOR_DOM_EXCEPTIONS,
} from "../../lib/rendering/canonical";

const fixture = {
  contractVersion: 1,
  id: "p0-canvas-parity",
  page: {
    id: "page-parity",
    title: "Canvas parity",
    slug: "canvas-parity",
    nodes: [],
    status: "draft",
  },
  layout: null,
  components: [],
  viewports: [
    {
      name: "desktop",
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
    },
  ],
  expectedFailures: [
    {
      id: "PARITY-STAGE-ROOT",
      status: "active",
      ownerPhase: 7,
      assertion: "authored-dom",
      reason: "The Stage content root remains until canonical materialization.",
    },
  ],
} as const;

describe("browser parity contracts", () => {
  it("accepts a strict, schema-valid fixture", () => {
    const parsed = BrowserParityFixtureSchema.parse(fixture);

    expect(parsed.id).toBe("p0-canvas-parity");
    expect(parsed.viewports[0]?.deviceScaleFactor).toBe(1);
  });

  it("rejects unknown fixture keys and invalid browser scales", () => {
    expect(
      BrowserParityFixtureSchema.safeParse({
        ...fixture,
        viewports: [
          {
            name: "desktop",
            width: 1280,
            height: 800,
            deviceScaleFactor: 2,
          },
        ],
        unvalidated: true,
      }).success,
    ).toBe(false);
  });

  it("rejects malformed runtime snapshots", () => {
    expect(
      BrowserParitySurfaceSnapshotSchema.safeParse({
        contractVersion: 1,
        runtime: "cloudflare",
        surface: "stage",
      }).success,
    ).toBe(false);
  });

  it("accepts each strict overlay and event discriminator", () => {
    expect(
      CanvasAffordanceDescriptorSchema.parse({
        kind: "missing-media",
        nodeId: "image-1",
        nodeType: "image",
        position: { left: 0, top: 0, width: 0, height: 0 },
        presentation: "collapsed-rail",
        depth: 1,
      }).kind,
    ).toBe("missing-media");
    expect(
      EditorCaptureEventSchema.parse({
        kind: "pointer",
        eventType: "pointerdown",
        target: "button",
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      }).kind,
    ).toBe("pointer");
  });

  it("rejects malformed overlay and untyped event input", () => {
    expect(
      CanvasAffordanceDescriptorSchema.safeParse({
        kind: "missing-media",
        nodeId: "image-1",
        nodeType: "audio",
        position: { left: 0, top: 0, width: -1, height: 0 },
        presentation: "box",
        depth: 0,
      }).success,
    ).toBe(false);
    expect(
      EditorCaptureEventSchema.safeParse({
        kind: "pointer",
        eventType: "mousedown",
        target: "button",
      }).success,
    ).toBe(false);
  });

  it("validates runtime host successes and typed failures", () => {
    expect(
      BrowserParityRuntimeHostResultSchema.parse({
        status: "ready",
        runtime: "node",
        origin: "http://127.0.0.1:4381",
      }).status,
    ).toBe("ready");
    expect(
      BrowserParityRuntimeHostResultSchema.parse({
        status: "failed",
        runtime: "workerd",
        diagnostic: {
          code: "PARITY_HOST_NOT_READY",
          message: "Timed out waiting for workerd",
        },
      }).status,
    ).toBe("failed");
    expect(
      BrowserParityRuntimeHostResultSchema.safeParse({
        status: "failed",
        runtime: "cloudflare",
        diagnostic: { code: "UNKNOWN", message: "" },
      }).success,
    ).toBe(false);
  });

  it("registers only exact editor exceptions", () => {
    expect(PHASE_2_EDITOR_DOM_EXCEPTIONS.unwrapAttributes).toEqual([
      "data-aria-stage-content-root",
    ]);
    expect(PHASE_2_EDITOR_DOM_EXCEPTIONS.removeAttributes).not.toContain(
      "style",
    );
    expect(PHASE_2_EDITOR_DOM_EXCEPTIONS.removeAttributes).not.toContain(
      "class",
    );
  });
});
