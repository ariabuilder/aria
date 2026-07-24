import { describe, expect, it } from "vitest";

import {
  CANVAS_BODY_BACKGROUND_FALLBACK,
  hasAuthoredCanvasBackgroundCss,
  resolveCanvasBodyBackground,
} from "../../../admin/features/Stage/utils/canvasBackgroundFallback";

describe("canvasBackgroundFallback", () => {
  it("uses the design-system fallback when the body background is absent", () => {
    expect(
      resolveCanvasBodyBackground({
        computedStyle: {
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: "none",
        },
      }),
    ).toEqual({
      background: CANVAS_BODY_BACKGROUND_FALLBACK,
      usedFallback: true,
    });
  });

  it("keeps an authored body background color", () => {
    expect(
      resolveCanvasBodyBackground({
        computedStyle: {
          backgroundColor: "rgb(9, 9, 9)",
          backgroundImage: "none",
        },
      }),
    ).toEqual({
      background: null,
      usedFallback: false,
    });
  });

  it("keeps an authored body background image", () => {
    expect(
      resolveCanvasBodyBackground({
        computedStyle: {
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: "linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))",
        },
      }),
    ).toEqual({
      background: null,
      usedFallback: false,
    });
  });

  it("keeps an authored root background when the body is transparent", () => {
    expect(
      resolveCanvasBodyBackground({
        computedStyle: {
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: "none",
        },
        rootComputedStyle: {
          backgroundColor: "rgb(9, 9, 9)",
          backgroundImage: "none",
        },
      }),
    ).toEqual({
      background: null,
      usedFallback: false,
    });
  });

  it("keeps an authored body background declared in CSS text", () => {
    expect(
      resolveCanvasBodyBackground({
        computedStyle: {
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: "none",
        },
        authoredCssText: "body { background-color: #632121; }",
      }),
    ).toEqual({
      background: null,
      usedFallback: false,
    });
  });
});

describe("hasAuthoredCanvasBackgroundCss", () => {
  it("detects body background declarations", () => {
    expect(
      hasAuthoredCanvasBackgroundCss("body { background-color: #632121; }"),
    ).toBe(true);
  });

  it("detects html and combined html/body background declarations", () => {
    expect(
      hasAuthoredCanvasBackgroundCss("html, body { background: #000; }"),
    ).toBe(true);
    expect(
      hasAuthoredCanvasBackgroundCss(
        "html { background-image: linear-gradient(#000, #111); }",
      ),
    ).toBe(true);
  });

  it("ignores unrelated background rules", () => {
    expect(
      hasAuthoredCanvasBackgroundCss(".card { background-color: #fff; }"),
    ).toBe(false);
  });
});
