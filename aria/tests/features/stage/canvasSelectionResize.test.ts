import { describe, expect, it } from "vitest";

import {
  canvasSelectionResizeAxes,
  canvasSelectionResizeCursor,
  formatCanvasSelectionSize,
  getCanvasSelectionScale,
  resizeCanvasSelection,
} from "../../../admin/features/Stage/utils/canvasSelectionResize";

describe("canvasSelectionResize", () => {
  it("resizes the axes represented by edge and corner handles", () => {
    expect(
      resizeCanvasSelection({
        handle: "east",
        startSize: { width: 240, height: 120 },
        deltaX: 35,
        deltaY: 50,
      }),
    ).toEqual({ width: 275, height: 120 });

    expect(
      resizeCanvasSelection({
        handle: "north-west",
        startSize: { width: 240, height: 120 },
        deltaX: -20,
        deltaY: 15,
      }),
    ).toEqual({ width: 260, height: 105 });

    expect(canvasSelectionResizeAxes("south-east")).toEqual({
      width: true,
      height: true,
    });
    expect(canvasSelectionResizeAxes("south")).toEqual({
      width: false,
      height: true,
    });
  });

  it("clamps both dimensions to the inclusive minimum", () => {
    expect(
      resizeCanvasSelection({
        handle: "south-east",
        startSize: { width: 20, height: 20 },
        deltaX: -200,
        deltaY: -200,
      }),
    ).toEqual({ width: 1, height: 1 });
  });

  it("converts host pointer movement using the iframe scale", () => {
    const iframe = document.createElement("iframe");
    Object.defineProperty(iframe, "clientWidth", {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(iframe, "clientHeight", {
      value: 600,
      configurable: true,
    });
    iframe.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 400,
        bottom: 150,
        width: 400,
        height: 150,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    expect(getCanvasSelectionScale(iframe)).toEqual({ x: 0.5, y: 0.25 });
  });

  it("uses standard resize cursors and stable rounded labels", () => {
    expect(canvasSelectionResizeCursor("north-west")).toBe("nwse-resize");
    expect(canvasSelectionResizeCursor("north-east")).toBe("nesw-resize");
    expect(canvasSelectionResizeCursor("east")).toBe("ew-resize");
    expect(canvasSelectionResizeCursor("south")).toBe("ns-resize");
    expect(formatCanvasSelectionSize({ width: 577.4, height: 392.7 })).toBe(
      "577 × 393",
    );
  });
});
