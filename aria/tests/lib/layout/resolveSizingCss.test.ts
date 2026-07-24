import { describe, expect, it } from "vitest";

import {
  inferSizeModeFromCSSValue,
  mergeSizingResolutionAcrossBreakpoints,
  resolveParentLayoutContext,
  resolveSizeMode,
  resolveSizingCssForBreakpoint,
} from "../../../lib/layout/resolveSizingCss";
import type { BreakpointDefinition, BuilderNode } from "../../../lib/types/nodes";

const BREAKPOINTS: BreakpointDefinition[] = [
  { name: "base", minWidth: "1280px", label: "Desktop" },
  { name: "tablet", minWidth: "768px", label: "Tablet" },
];

function createNode(
  partial: Partial<BuilderNode> & Pick<BuilderNode, "id">,
): BuilderNode {
  return {
    type: "Container",
    props: {},
    styles: {},
    children: [],
    ...partial,
  };
}

describe("resolveSizingCss", () => {
  it("infers legacy CSS values into sizing modes", () => {
    expect(inferSizeModeFromCSSValue("auto")).toBe("hug");
    expect(inferSizeModeFromCSSValue("fit-content")).toBe("hug");
    expect(inferSizeModeFromCSSValue("100%")).toBe("fill");
    expect(inferSizeModeFromCSSValue("320px")).toBe("exact");
  });

  it("prefers stored sizing modes over legacy width values", () => {
    expect(
      resolveSizeMode(
        {
          widthSizing: { base: "fill" },
          width: { base: "320px" },
        },
        "width",
        "base",
        BREAKPOINTS,
      ),
    ).toBe("fill");
  });

  it("resolves block hug to fit-content", () => {
    const css = resolveSizingCssForBreakpoint(
      { widthSizing: { base: "hug" } },
      null,
      "base",
      BREAKPOINTS,
    );

    expect(css.width).toBe("fit-content");
  });

  it("resolves block fill to 100%", () => {
    const css = resolveSizingCssForBreakpoint(
      { widthSizing: { base: "fill" } },
      null,
      "base",
      BREAKPOINTS,
    );

    expect(css.width).toBe("100%");
  });

  it("resolves flex row primary fill with flex-grow", () => {
    const parent = createNode({
      id: "parent",
      styles: {
        display: { base: "flex" },
        flexDirection: { base: "row" },
      },
    });
    const parentContext = resolveParentLayoutContext(parent, "base", BREAKPOINTS);

    const css = resolveSizingCssForBreakpoint(
      { widthSizing: { base: "fill" } },
      parentContext,
      "base",
      BREAKPOINTS,
    );

    expect(css.flexGrow).toBe("1");
    expect(css.flexBasis).toBe("0");
  });

  it("resolves flex column primary fill on height", () => {
    const parent = createNode({
      id: "parent",
      styles: {
        display: { base: "flex" },
        flexDirection: { base: "column" },
      },
    });
    const parentContext = resolveParentLayoutContext(parent, "base", BREAKPOINTS);

    const css = resolveSizingCssForBreakpoint(
      { heightSizing: { base: "fill" } },
      parentContext,
      "base",
      BREAKPOINTS,
    );

    expect(css.flexGrow).toBe("1");
    expect(css.flexBasis).toBe("0");
  });

  it("resolves flex row cross-axis hug with fit-content height", () => {
    const parent = createNode({
      id: "parent",
      styles: {
        display: { base: "flex" },
        flexDirection: { base: "row" },
      },
    });
    const parentContext = resolveParentLayoutContext(parent, "base", BREAKPOINTS);

    const css = resolveSizingCssForBreakpoint(
      { heightSizing: { base: "hug" } },
      parentContext,
      "base",
      BREAKPOINTS,
    );

    expect(css.alignSelf).toBe("flex-start");
    expect(css.height).toBe("fit-content");
  });

  it("keeps exact width values and strips sizing metadata from merged styles", () => {
    const merged = mergeSizingResolutionAcrossBreakpoints(
      {
        widthSizing: { base: "exact" },
        width: { base: "320px" },
        heightSizing: { base: "hug" },
      },
      null,
      BREAKPOINTS,
    );

    expect(merged.widthSizing).toBeUndefined();
    expect(merged.heightSizing).toBeUndefined();
    expect(merged.width?.base).toBe("320px");
    expect(merged.height?.base).toBe("fit-content");
  });

  it("maps legacy fill width to resolved fill CSS", () => {
    const parent = createNode({
      id: "parent",
      styles: {
        display: { base: "flex" },
        flexDirection: { base: "row" },
      },
    });

    const merged = mergeSizingResolutionAcrossBreakpoints(
      {
        width: { base: "100%" },
      },
      parent,
      BREAKPOINTS,
    );

    expect(merged.width).toBeUndefined();
    expect(merged.flexGrow?.base).toBe("1");
  });

  it("does not inject sizing CSS when no sizing is authored", () => {
    const merged = mergeSizingResolutionAcrossBreakpoints(
      {
        backgroundColor: { base: "#ffffff" },
      },
      null,
      BREAKPOINTS,
    );

    expect(merged.width).toBeUndefined();
    expect(merged.height).toBeUndefined();
    expect(merged.flexGrow).toBeUndefined();
  });
});
