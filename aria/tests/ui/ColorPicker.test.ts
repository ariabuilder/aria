import { describe, expect, it } from "vitest";

import {
  COLOR_PICKER_PANEL_CLASS,
  COLOR_PICKER_SHELL_CLASS,
  ColorField,
  ColorPicker,
} from "../../admin/components/ui/color-picker";
import { resolveColorPickerPopoverWidthClass } from "../../admin/features/Design/lib/colorFormat";
import {
  isReferenceStoredValue,
  resolveColorPickerSurfaceCommitValue,
  resolveColorPickerSurfacePreviewValue,
} from "../../admin/components/ui/color-picker/useColorPickerState";

describe("ColorPicker", () => {
  it("uses the standard popover width by default", () => {
    expect(resolveColorPickerPopoverWidthClass({})).toBe("w-[272px]");
  });

  it("uses a wider popover when design colors are enabled", () => {
    expect(
      resolveColorPickerPopoverWidthClass({ showDesignColors: true }),
    ).toBe("w-[288px]");
  });

  it("uses unified base width without design colors", () => {
    expect(
      resolveColorPickerPopoverWidthClass({
        layout: "unified",
      }),
    ).toBe("w-[272px]");
  });

  it("respects a custom content class override", () => {
    expect(
      resolveColorPickerPopoverWidthClass({
        showDesignColors: true,
        contentClass: "w-96",
      }),
    ).toBe("w-96");
  });

  it("detects CSS variable references", () => {
    expect(isReferenceStoredValue("var(--brand-primary)")).toBe(true);
    expect(isReferenceStoredValue("#ff0000")).toBe(false);
  });

  it("previews CSS variable references instead of resolved literal hex", () => {
    expect(
      resolveColorPickerSurfacePreviewValue(
        "reference",
        "var(--primary-400)",
        "#5b8def",
      ),
    ).toBe("var(--primary-400)");
  });

  it("previews literal values when not in reference mode", () => {
    expect(
      resolveColorPickerSurfacePreviewValue("literal", "#111111", "#ff0000"),
    ).toBe("#ff0000");
  });

  it("skips preview for unresolved variable references", () => {
    expect(
      resolveColorPickerSurfacePreviewValue(
        "reference-unresolved",
        "var(--missing)",
        "#ff0000",
      ),
    ).toBeNull();
  });

  it("commits CSS variable references without detaching to literal hex", () => {
    expect(
      resolveColorPickerSurfaceCommitValue(
        "reference",
        "var(--primary-400)",
        "#5b8def",
        false,
      ),
    ).toBe("var(--primary-400)");
  });

  it("commits literal hex after an explicit reference detach", () => {
    expect(
      resolveColorPickerSurfaceCommitValue(
        "reference",
        "var(--primary-400)",
        "#ff0000",
        true,
      ),
    ).toBe("#ff0000");
  });

  it("commits literal values in literal mode", () => {
    expect(
      resolveColorPickerSurfaceCommitValue(
        "literal",
        "#111111",
        "#ff0000",
        false,
      ),
    ).toBe("#ff0000");
  });
});

describe("ColorPicker exports", () => {
  it("exports the ColorPicker component", () => {
    expect(ColorPicker).toBeTruthy();
  });

  it("exports ColorField and panel tokens", () => {
    expect(ColorField).toBeTruthy();
    expect(COLOR_PICKER_SHELL_CLASS).toContain("bg-muted");
    expect(COLOR_PICKER_SHELL_CLASS).toContain("p-0");
    expect(COLOR_PICKER_SHELL_CLASS).toContain("border-solid");
    expect(COLOR_PICKER_PANEL_CLASS).toContain("bg-sidebar");
    expect(COLOR_PICKER_PANEL_CLASS).toContain("border-solid");
  });
});
