import { describe, expect, it } from "vitest";

import {
  generatePerceptualShades,
  generateNaturalShades,
  expandTemplateColorBases,
} from "../../../lib/design/shades";
import { getRelativeLuminance } from "../../../lib/design/colorContrast";
import { COLOR_SHADES } from "../../../lib/design/types";

const HEX_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

describe("perceptual shade generation", () => {
  it.each([
    "#3d6fae",
    "#4d7c6a",
    "#b07a5f",
    "#8b5cf6",
    "#71717a",
    "#000000",
    "#ffffff",
  ])("creates a complete ordered scale for %s", (baseColor) => {
    const palette = generatePerceptualShades(baseColor);
    const values = COLOR_SHADES.map((shade) => palette[shade]);
    const luminances = values.map((value) => getRelativeLuminance(value));

    expect(palette.DEFAULT).toBe(baseColor.toLowerCase());
    expect(values.every((value) => HEX_COLOR.test(value))).toBe(true);
    expect(new Set(values)).toHaveProperty("size", COLOR_SHADES.length);

    for (let index = 1; index < luminances.length; index += 1) {
      expect(luminances[index - 1]).not.toBeNull();
      expect(luminances[index]).not.toBeNull();
      expect(luminances[index - 1]!).toBeGreaterThan(luminances[index]!);
    }
  });

  it("preserves alpha on the default and every numeric shade", () => {
    const palette = generateNaturalShades("#3d6fae80");

    expect(palette.DEFAULT).toBe("#3d6fae80");
    expect(COLOR_SHADES.every((shade) => palette[shade].length === 9)).toBe(
      true,
    );
  });

  it("uses role chroma strengths without copying neutral endpoints", () => {
    const palettes = expandTemplateColorBases(
      {
        primary: "#3d6fae",
        secondary: "#5a7a9e",
        muted: "#7e8da1",
        neutral: "#6e7a90",
      },
      { neutralWarmth: -0.2 },
    );

    expect(palettes.primary[25]).not.toBe(palettes.neutral[25]);
    expect(palettes.primary[950]).not.toBe(palettes.neutral[950]);
    expect(palettes.secondary[400]).not.toBe(palettes.primary[400]);
    expect(palettes.muted[500]).not.toBe(palettes.neutral[500]);
  });
});
