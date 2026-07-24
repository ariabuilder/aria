import { describe, expect, it } from "vitest";

import { createFocalAspectRatioCrop } from "../../lib/media/transforms/crop";

describe("focal aspect-ratio crops", () => {
  it("centers a ratio crop when no focal point is set", () => {
    expect(
      createFocalAspectRatioCrop({
        source: { width: 2000, height: 1000 },
        aspectRatio: { width: 1, height: 1 },
      }),
    ).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
  });

  it("positions the generated crop around the focal point", () => {
    expect(
      createFocalAspectRatioCrop({
        source: { width: 2000, height: 1000 },
        aspectRatio: { width: 1, height: 1 },
        focalPoint: { x: 0.7, y: 0.5 },
      }),
    ).toEqual({ x: 0.45, y: 0, width: 0.5, height: 1 });
  });

  it("clamps edge focal points without moving outside the source", () => {
    expect(
      createFocalAspectRatioCrop({
        source: { width: 2000, height: 1000 },
        aspectRatio: { width: 1, height: 1 },
        focalPoint: { x: 0.98, y: 0.02 },
      }),
    ).toEqual({ x: 0.5, y: 0, width: 0.5, height: 1 });
  });
});
