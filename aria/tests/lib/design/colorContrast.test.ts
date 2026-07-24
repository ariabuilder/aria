import { describe, expect, it } from "vitest";

import {
  ContrastEvaluationSchema,
  ContrastPairInputSchema,
  evaluateContrastPair,
  formatContrastRatio,
  getContrastRatio,
  getRelativeLuminance,
  pickReadableTextColor,
  resolveEffectiveBackgroundColor,
} from "../../../lib/design/colorContrast";

describe("colorContrast", () => {
  it("returns luminance for valid colors", () => {
    expect(getRelativeLuminance("#ffffff")).toBeCloseTo(1, 2);
    expect(getRelativeLuminance("#000000")).toBeCloseTo(0, 2);
  });

  it("returns null for invalid colors", () => {
    expect(getRelativeLuminance("not-a-color")).toBeNull();
    expect(getContrastRatio("bad", "#fff")).toBeNull();
    expect(getContrastRatio("#fff", "bad")).toBeNull();
  });

  it("computes black on white contrast near 21:1", () => {
    const ratio = getContrastRatio("#000000", "#ffffff");
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThan(20);
    expect(ratio!).toBeLessThan(22);
  });

  it("evaluates WCAG thresholds", () => {
    const evaluation = evaluateContrastPair({
      foreground: "#000000",
      background: "#ffffff",
    });
    expect(evaluation).not.toBeNull();
    expect(evaluation!.aaNormal).toBe(true);
    expect(evaluation!.aaaNormal).toBe(true);
    expect(ContrastEvaluationSchema.safeParse(evaluation).success).toBe(true);
  });

  it("fails AA for low-contrast pair", () => {
    const evaluation = evaluateContrastPair({
      foreground: "#777777",
      background: "#888888",
    });
    expect(evaluation).not.toBeNull();
    expect(evaluation!.aaNormal).toBe(false);
    expect(evaluation!.aaaNormal).toBe(false);
  });

  it("rejects invalid input via zod", () => {
    expect(
      evaluateContrastPair({ foreground: "", background: "#fff" }),
    ).toBeNull();
    expect(ContrastPairInputSchema.safeParse({ foreground: "x" }).success).toBe(
      false,
    );
  });

  it("formats ratio for display", () => {
    expect(formatContrastRatio(4.523)).toBe("4.52:1");
    expect(formatContrastRatio(0)).toBe("");
  });

  describe("pickReadableTextColor", () => {
    it("picks dark text on light backgrounds", () => {
      expect(pickReadableTextColor("#ffffff")).toBe("#000000");
      expect(pickReadableTextColor("#ffff00")).toBe("#000000");
    });

    it("picks light text on dark backgrounds", () => {
      expect(pickReadableTextColor("#000000")).toBe("#ffffff");
      expect(pickReadableTextColor("#000080")).toBe("#ffffff");
    });

    it("composites alpha over checkerboard backdrop", () => {
      expect(
        pickReadableTextColor("rgba(255, 255, 255, 0.5)", {
          backdrop: "#555555",
        }),
      ).toBe("#000000");
      expect(resolveEffectiveBackgroundColor("rgba(255, 255, 255, 0.5)")).not.toBeNull();
    });

    it("returns null for transparent or invalid colors", () => {
      expect(pickReadableTextColor("transparent")).toBeNull();
      expect(pickReadableTextColor("rgba(0, 0, 0, 0)")).toBeNull();
      expect(pickReadableTextColor("not-a-color")).toBeNull();
      expect(resolveEffectiveBackgroundColor("transparent")).toBeNull();
    });
  });
});
