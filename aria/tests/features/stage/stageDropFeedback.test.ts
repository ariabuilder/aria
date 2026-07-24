import { describe, expect, it } from "vitest";
import { resolvePrimaryColor } from "../../../admin/features/Stage/styles/stageDropFeedback";

describe("resolvePrimaryColor", () => {
  it("wraps HSL channel tokens in hsl()", () => {
    const doc = document.implementation.createHTMLDocument("test");
    doc.documentElement.style.setProperty("--primary", "217.2 91.2% 59.8%");

    expect(resolvePrimaryColor(doc)).toBe("hsl(217.2 91.2% 59.8%)");
  });

  it("returns oklch values unchanged", () => {
    const doc = document.implementation.createHTMLDocument("test");
    doc.documentElement.style.setProperty("--primary", "oklch(0.66 0.12 216.53)");

    expect(resolvePrimaryColor(doc)).toBe("oklch(0.66 0.12 216.53)");
  });
});
