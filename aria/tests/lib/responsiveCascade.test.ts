import { describe, expect, it } from "vitest";

import {
  buildDesktopFirstCascadeClearValues,
  buildDesktopFirstCascadeStyleMutation,
  cascadeMutationToCanvasStyles,
  getAuthoredBreakpointNamesFromStyleValue,
  mergeCascadeStyleMutations,
} from "../../lib/styles/responsiveCascade";
import {
  createBreakpointDefinitionsFromUniversalBreakpoints,
} from "../../lib/styles/universalDesignSystem";

const SEED_BREAKPOINTS = [
  {
    id: "base",
    label: "Desktop",
    icon: "Monitor",
    minWidth: 2400,
    canvasWidth: 1440,
    enabled: true,
    isDefault: true,
    order: 0,
  },
  {
    id: "testing",
    label: "Testing",
    icon: "Monitor",
    minWidth: 2400,
    canvasWidth: 2400,
    enabled: true,
    isDefault: false,
    order: 1,
  },
  {
    id: "tablet",
    label: "Tablet",
    icon: "Tablet",
    minWidth: 768,
    canvasWidth: 768,
    enabled: true,
    isDefault: true,
    order: 3,
  },
  {
    id: "mobile",
    label: "Mobile",
    icon: "Smartphone",
    minWidth: 0,
    canvasWidth: 375,
    enabled: true,
    isDefault: true,
    order: 4,
  },
];

const breakpoints = createBreakpointDefinitionsFromUniversalBreakpoints(
  SEED_BREAKPOINTS,
);

describe("responsiveCascade", () => {
  it("reads authored breakpoint names from responsive style values", () => {
    expect(
      getAuthoredBreakpointNamesFromStyleValue({
        base: "blue",
        tablet: "red",
        default: "ignored",
      }),
    ).toEqual(["base", "tablet"]);
  });

  it("builds cascade style mutations for upstream saves", () => {
    expect(
      buildDesktopFirstCascadeStyleMutation(
        breakpoints,
        "backgroundColor",
        "testing",
        "#0000ff",
        { base: "#ff0000", tablet: "#00ff00" },
      ),
    ).toEqual({
      backgroundColor: {
        testing: "#0000ff",
        base: "#0000ff",
        tablet: undefined,
      },
    });
  });

  it("clears current and downstream breakpoints on reset-style clears", () => {
    expect(
      buildDesktopFirstCascadeClearValues(breakpoints, "base", [
        "base",
        "tablet",
      ]),
    ).toEqual({
      base: undefined,
      tablet: undefined,
    });
  });

  it("merges cascade mutations and converts them to canvas preview payloads", () => {
    const merged = mergeCascadeStyleMutations([
      {
        paddingTop: {
          base: "24px",
          tablet: undefined,
        },
      },
      {
        paddingBottom: {
          base: "24px",
        },
      },
    ]);

    expect(merged).toEqual({
      paddingTop: {
        base: "24px",
        tablet: undefined,
      },
      paddingBottom: {
        base: "24px",
      },
    });

    expect(cascadeMutationToCanvasStyles(merged)).toEqual({
      base: {
        paddingTop: "24px",
        paddingBottom: "24px",
      },
      tablet: {
        paddingTop: undefined,
      },
    });
  });
});
