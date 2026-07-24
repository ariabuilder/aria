import { describe, it, expect } from "vitest";
import { GlobalStylesPatchSchema } from "@/features/Agent/lib/tools/design/schemas";

describe("GlobalStylesPatchSchema", () => {
  it("accepts valid section patch", () => {
    const result = GlobalStylesPatchSchema.safeParse({
      defaults: {
        section: {
          verticalPadding: "24px",
          horizontalPadding: "16px",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial section update (one field)", () => {
    const result = GlobalStylesPatchSchema.safeParse({
      defaults: {
        section: {
          verticalPadding: "24px",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts body style patch", () => {
    const result = GlobalStylesPatchSchema.safeParse({
      defaults: {
        body: {
          fontFamily: "Inter, sans-serif",
          color: "#111827",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts variables patch", () => {
    const result = GlobalStylesPatchSchema.safeParse({
      variables: {
        custom: {
          "card-shadow": {
            value: "0 4px 12px rgba(0,0,0,0.1)",
            label: "Card Shadow",
            category: "effects",
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown top-level keys", () => {
    const result = GlobalStylesPatchSchema.safeParse({
      sections: {
        base: { padding: "24px" },
      },
    });
    // "sections" does NOT exist in the real GlobalStylesConfig shape
    expect(result.success).toBe(false);
  });

  it("rejects made-up fields in section", () => {
    const result = GlobalStylesPatchSchema.safeParse({
      defaults: {
        section: {
          padding: "24px", // NOT a real field — real fields are verticalPadding, horizontalPadding, contentMaxWidth, sectionGap
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty patch", () => {
    // All keys are optional — empty object is valid
    const result = GlobalStylesPatchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts multiple defaults sections", () => {
    const result = GlobalStylesPatchSchema.safeParse({
      defaults: {
        section: { verticalPadding: "24px" },
        body: { fontSize: "16px" },
        link: { color: "#3b82f6" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts variables aliases patch", () => {
    const result = GlobalStylesPatchSchema.safeParse({
      variables: {
        aliases: {
          "primary-text": {
            label: "Primary Text",
            sourceType: "token",
            sourceKey: "colors.primary.500",
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts combined defaults + variables patch", () => {
    const result = GlobalStylesPatchSchema.safeParse({
      defaults: {
        section: { verticalPadding: "24px" },
      },
      variables: {
        custom: {
          "brand-radius": {
            value: "8px",
            label: "Brand Radius",
            category: "borders",
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });
});
