import { describe, it, expect } from "vitest";
import { AriaRegenerateGlobalCssInputSchema, AriaRegenerateGlobalCssOutputSchema } from "@/features/Agent/lib/schemas";

describe("AriaRegenerateGlobalCssInputSchema", () => {
  it("accepts empty input", () => {
    const result = AriaRegenerateGlobalCssInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts with styleRevision lock", () => {
    const result = AriaRegenerateGlobalCssInputSchema.safeParse({
      styleRevision: "rev_abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects extra fields", () => {
    const result = AriaRegenerateGlobalCssInputSchema.safeParse({
      force: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("AriaRegenerateGlobalCssOutputSchema", () => {
  it("accepts valid success output", () => {
    const result = AriaRegenerateGlobalCssOutputSchema.safeParse({
      success: true,
      globalCSSHash: "abc123def456",
      cssSize: 45678,
      classCount: 42,
      lastCompiled: "2024-01-01T00:00:00.000Z",
      framework: "unocss",
      styleRevision: "rev_20240101_001",
      invalidatedPageCount: 3,
    });
    expect(result.success).toBe(true);
  });

  it("accepts custom framework value", () => {
    const result = AriaRegenerateGlobalCssOutputSchema.safeParse({
      success: true,
      globalCSSHash: "xyz",
      cssSize: 1000,
      classCount: 5,
      lastCompiled: "now",
      framework: "custom" as const,
      styleRevision: "rev_x",
      invalidatedPageCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing styleRevision", () => {
    const result = AriaRegenerateGlobalCssOutputSchema.safeParse({
      success: true,
      globalCSSHash: "abc",
      cssSize: 100,
      classCount: 1,
      lastCompiled: "now",
      framework: "custom",
      invalidatedPageCount: 0,
      // styleRevision missing
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero cssSize", () => {
    const result = AriaRegenerateGlobalCssOutputSchema.safeParse({
      success: true,
      globalCSSHash: "abc",
      cssSize: 0,
      classCount: 1,
      lastCompiled: "now",
      framework: "unocss",
      styleRevision: "rev",
      invalidatedPageCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative classCount", () => {
    const result = AriaRegenerateGlobalCssOutputSchema.safeParse({
      success: true,
      globalCSSHash: "abc",
      cssSize: 100,
      classCount: -1,
      lastCompiled: "now",
      framework: "unocss",
      styleRevision: "rev",
      invalidatedPageCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid framework", () => {
    const result = AriaRegenerateGlobalCssOutputSchema.safeParse({
      success: true,
      globalCSSHash: "abc",
      cssSize: 100,
      classCount: 1,
      lastCompiled: "now",
      framework: "tailwind" as never,
      styleRevision: "rev",
      invalidatedPageCount: 0,
    });
    expect(result.success).toBe(false);
  });
});
