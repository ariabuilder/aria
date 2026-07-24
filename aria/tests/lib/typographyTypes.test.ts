import { describe, expect, it } from "vitest";
import {
  getTypographyTypeKey,
  isTypographyNodeType,
  normalizeTypographyNodeType,
} from "../../lib/blocks/typographyTypes";

describe("typographyTypes", () => {
  it("normalizes heading aliases", () => {
    expect(normalizeTypographyNodeType("Heading")).toBe("heading");
    expect(normalizeTypographyNodeType("heading")).toBe("heading");
  });

  it("normalizes body copy aliases to text", () => {
    expect(normalizeTypographyNodeType("Paragraph")).toBe("text");
    expect(normalizeTypographyNodeType("paragraph")).toBe("text");
    expect(normalizeTypographyNodeType("Text")).toBe("text");
    expect(normalizeTypographyNodeType("text")).toBe("text");
  });

  it("returns null for non-typography types", () => {
    expect(normalizeTypographyNodeType("button")).toBeNull();
    expect(normalizeTypographyNodeType("span")).toBeNull();
  });

  it("exposes helpers", () => {
    expect(isTypographyNodeType("Paragraph")).toBe(true);
    expect(getTypographyTypeKey("Heading")).toBe("heading");
  });
});
