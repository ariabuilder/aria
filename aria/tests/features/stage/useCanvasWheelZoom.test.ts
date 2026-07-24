import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { anchorCanvasScrollToCursor } from "../../../admin/features/Stage/composables/useCanvasWheelZoom";

describe("anchorCanvasScrollToCursor", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the world point under the cursor after scroll width grows", () => {
    const container = document.createElement("div");
    let scrollWidth = 2000;

    Object.defineProperty(container, "scrollWidth", {
      configurable: true,
      get: () => scrollWidth,
    });
    Object.defineProperty(container, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 400,
    });
    container.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) => {
        scrollWidth = 2500;
        callback(0);
        return 1;
      },
    );

    anchorCanvasScrollToCursor(container, 500);

    expect(container.scrollLeft).toBe(625);
  });
});
