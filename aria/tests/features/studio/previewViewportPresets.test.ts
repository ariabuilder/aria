import { describe, expect, it } from "vitest";

import { createDefaultUniversalBreakpointItems } from "@/lib/styles/universalDesignSystem";
import {
  buildPreviewViewportPresetOptions,
  resolvePreviewPresetBreakpoint,
  resolvePreviewPresetCanvasWidth,
} from "../../../admin/features/Studio/pages/composables/previewViewportPresets";

describe("previewViewportPresets", () => {
  it("maps desktop to the base breakpoint", () => {
    const breakpoints = createDefaultUniversalBreakpointItems();
    const desktop = resolvePreviewPresetBreakpoint("desktop", breakpoints);

    expect(desktop?.id).toBe("base");
    expect(resolvePreviewPresetCanvasWidth("desktop", breakpoints)).toBe(1440);
  });

  it("maps tablet and mobile to their canonical breakpoint ids", () => {
    const breakpoints = createDefaultUniversalBreakpointItems();

    expect(resolvePreviewPresetBreakpoint("tablet", breakpoints)?.id).toBe(
      "tablet",
    );
    expect(resolvePreviewPresetBreakpoint("mobile", breakpoints)?.id).toBe(
      "mobile",
    );
    expect(resolvePreviewPresetCanvasWidth("tablet", breakpoints)).toBe(768);
    expect(resolvePreviewPresetCanvasWidth("mobile", breakpoints)).toBe(375);
  });

  it("falls back when tablet is disabled", () => {
    const breakpoints = createDefaultUniversalBreakpointItems().map(
      (breakpoint) =>
        breakpoint.id === "tablet"
          ? { ...breakpoint, enabled: false }
          : breakpoint,
    );

    expect(resolvePreviewPresetBreakpoint("tablet", breakpoints)?.id).toBe(
      "laptop",
    );
  });

  it("builds tooltip labels for the three exposed presets", () => {
    const options = buildPreviewViewportPresetOptions(
      createDefaultUniversalBreakpointItems(),
    );

    expect(options).toHaveLength(3);
    expect(options.map((option) => option.preset)).toEqual([
      "desktop",
      "tablet",
      "mobile",
    ]);
    expect(options[0]?.tooltip).toContain("Desktop");
    expect(options[0]?.tooltip).toContain("1440px");
  });
});
