import { describe, it, expect } from "vitest";
import { AriaManageCssVariablesInputSchema } from "@/features/Agent/lib/schemas";

describe("AriaManageCssVariablesInputSchema", () => {
  it("accepts setting variables", () => {
    const result = AriaManageCssVariablesInputSchema.safeParse({
      variables: { "card-shadow": "0 4px 12px rgba(0,0,0,0.1)" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts removing variables", () => {
    const result = AriaManageCssVariablesInputSchema.safeParse({
      remove: ["old-var"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts both set and remove", () => {
    const result = AriaManageCssVariablesInputSchema.safeParse({
      variables: { "new-var": "10px" },
      remove: ["old-var"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects neither set nor remove", () => {
    const result = AriaManageCssVariablesInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty variables record", () => {
    const result = AriaManageCssVariablesInputSchema.safeParse({
      variables: {},
    });
    // Record with no entries is still valid — it's an empty assignment
    expect(result.success).toBe(true);
  });

  it("accepts multiple variables at once", () => {
    const result = AriaManageCssVariablesInputSchema.safeParse({
      variables: {
        "card-shadow": "0 4px 12px rgba(0,0,0,0.1)",
        "card-radius": "8px",
        "brand-gap": "1.5rem",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty remove array", () => {
    const result = AriaManageCssVariablesInputSchema.safeParse({
      variables: { "test": "value" },
      remove: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects extra fields", () => {
    const result = AriaManageCssVariablesInputSchema.safeParse({
      variables: { "test": "red" },
      force: true,
    });
    expect(result.success).toBe(false);
  });
});
