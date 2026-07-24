import { describe, expect, it } from "vitest";

import {
  computeArtboardLayout,
  parseArtboardWidthPx,
} from "../../../admin/features/Stage/utils/canvasArtboardLayout";

describe("parseArtboardWidthPx", () => {
  it("parses pixel widths", () => {
    expect(parseArtboardWidthPx("2400px")).toBe(2400);
    expect(parseArtboardWidthPx("1440px")).toBe(1440);
  });

  it("returns null for fluid widths", () => {
    expect(parseArtboardWidthPx("100%")).toBeNull();
    expect(parseArtboardWidthPx(undefined)).toBeNull();
  });
});

describe("computeArtboardLayout", () => {
  it("keeps fixed artboard layout width while scaling visually", () => {
    const layout = computeArtboardLayout({ width: "2400px", maxWidth: "2400px" }, 0.49);

    expect(layout.mode).toBe("fixed");
    expect(layout.isScaledFixed).toBe(true);
    expect(layout.artboardWidthPx).toBe(2400);
    expect(layout.artboardStyle.width).toBe("2400px");
    expect(layout.artboardStyle.maxWidth).toBe("2400px");
    expect(layout.artboardStyle.transform).toBe("scale(0.49)");
    expect(layout.artboardStyle.transformOrigin).toBe("top left");
    expect(layout.artboardStyle.height).toBe(`${100 / 0.49}%`);
    expect(layout.artboardStyle.position).toBe("absolute");
    expect(layout.artboardStyle.top).toBe("0");
    expect(layout.artboardStyle.left).toBe("0");
    expect(layout.slotWidthPx).toBe(1176);
    expect(layout.slotStyle.width).toBe("1176px");
    expect(layout.slotStyle.position).toBe("relative");
    expect(layout.slotStyle.overflow).toBe("visible");
  });

  it("uses transform scale at 100% with absolute positioning", () => {
    const layout = computeArtboardLayout({ width: "1440px", maxWidth: "1440px" }, 1);

    expect(layout.isScaledFixed).toBe(true);
    expect(layout.artboardStyle.width).toBe("1440px");
    expect(layout.artboardStyle.transform).toBe("scale(1)");
    expect(layout.artboardStyle.transformOrigin).toBe("top left");
    expect(layout.artboardStyle.position).toBe("absolute");
    expect(layout.artboardStyle.top).toBe("0");
    expect(layout.artboardStyle.left).toBe("0");
    expect(layout.artboardStyle.height).toBe("100%");
    expect(layout.slotWidthPx).toBe(1440);
    expect(layout.slotStyle.width).toBe("1440px");
    expect(layout.slotStyle.position).toBe("relative");
    expect(layout.slotStyle.overflow).toBe("visible");
  });

  it("supports fluid artboard widths", () => {
    const layout = computeArtboardLayout({ width: "100%", maxWidth: "none" }, 0.5);

    expect(layout.mode).toBe("fluid");
    expect(layout.isScaledFixed).toBe(false);
    expect(layout.artboardStyle.width).toBe("50%");
    expect(layout.artboardStyle.transform).toBe("none");
  });
});
