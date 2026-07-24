import { describe, expect, it } from "vitest";
import { colord } from "colord";

import {
  formatColorInput,
  parseColorInput,
  parseOklch,
  resolveColorPickerPopoverWidthClass,
  toSerializedHex,
} from "../../../admin/features/Design/lib/colorFormat";
import { normalizeRawColorInput } from "../../../admin/features/Design/lib/colorPickerValue";

describe("colorFormat", () => {
  it("serializes hex with alpha channel", () => {
    const color = colord({ r: 45, g: 73, b: 183, a: 0.5 });
    expect(toSerializedHex(color, true)).toBe("#2d49b780");
    expect(toSerializedHex(color, false)).toBe("#2d49b7");
  });

  it("parses oklch strings", () => {
    expect(parseOklch("oklch(50% 0.1 240)")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("formats and parses rgb", () => {
    const color = colord("#ff0000");
    const formatted = formatColorInput(color, "rgb");
    const parsed = parseColorInput(formatted, "rgb");
    expect(parsed?.toHex()).toBe("#ff0000");
  });

  it("formats oklch from color", () => {
    const color = colord("#ff0000");
    expect(formatColorInput(color, "oklch")).toMatch(/^oklch\(/);
    expect(formatColorInput(color, "oklch")).not.toContain("#");
  });

  it("formats and parses hsv", () => {
    const color = colord({ h: 120, s: 50, v: 50 });
    const formatted = formatColorInput(color, "hsv");
    const parsed = parseColorInput(formatted, "hsv");
    expect(parsed?.toHsv().h).toBeCloseTo(120, 0);
  });

  it("parses hex format with embedded oklch", () => {
    const parsed = parseColorInput("oklch(50% 0.1 240)", "hex");
    expect(parsed?.isValid()).toBe(true);
  });

  it("resolves popover width classes", () => {
    expect(resolveColorPickerPopoverWidthClass({ showDesignColors: true })).toBe(
      "w-[288px]",
    );
    expect(resolveColorPickerPopoverWidthClass({})).toBe("w-[272px]");
  });

  it("normalizes raw tab variable input", () => {
    expect(normalizeRawColorInput("var(--accent-300)")).toBe(
      "var(--accent-300)",
    );
    expect(normalizeRawColorInput("--accent-300")).toBe("var(--accent-300)");
    expect(normalizeRawColorInput("accent-300")).toBe("var(--accent-300)");
    expect(normalizeRawColorInput("#ff0000")).toBe("#ff0000");
  });
});
