import { describe, it, expect } from "vitest";
import {
  AriaCreateClassInputSchema,
  AriaDeleteClassInputSchema,
  AriaRenameClassInputSchema,
  AriaDuplicateClassInputSchema,
  AriaUpdateClassRuleInputSchema,
  AriaRemoveClassRuleInputSchema,
  AriaApplyClassToNodesInputSchema,
} from "@/features/Agent/lib/schemas";

describe("AriaCreateClassInputSchema", () => {
  it("accepts minimal valid class", () => {
    const result = AriaCreateClassInputSchema.safeParse({
      name: "pricing-card",
    });
    expect(result.success).toBe(true);
  });

  it("accepts class with description and initialRules", () => {
    const result = AriaCreateClassInputSchema.safeParse({
      name: "btn-primary",
      description: "Primary action button",
      initialRules: [
        { property: "padding", value: "12px 24px" },
        { property: "border-radius", value: "8px" },
        { property: "background-color", value: "var(--primary-500)" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts initialRules with important flag", () => {
    const result = AriaCreateClassInputSchema.safeParse({
      name: "important-class",
      initialRules: [
        { property: "display", value: "flex", important: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid class name (uppercase)", () => {
    const result = AriaCreateClassInputSchema.safeParse({
      name: "PricingCard",
    });
    expect(result.success).toBe(false);
  });

  it("rejects class name starting with digit", () => {
    const result = AriaCreateClassInputSchema.safeParse({
      name: "2col-layout",
    });
    expect(result.success).toBe(false);
  });

  it("rejects class name > 64 chars", () => {
    const result = AriaCreateClassInputSchema.safeParse({
      name: "a".repeat(65),
    });
    expect(result.success).toBe(false);
  });

  it("rejects description > 256 chars", () => {
    const result = AriaCreateClassInputSchema.safeParse({
      name: "test",
      description: "x".repeat(257),
    });
    expect(result.success).toBe(false);
  });

  it("rejects made-up fields (category)", () => {
    const result = AriaCreateClassInputSchema.safeParse({
      name: "test",
      category: "layout",
    });
    expect(result.success).toBe(false);
  });

  it("rejects initialRule with missing property", () => {
    const result = AriaCreateClassInputSchema.safeParse({
      name: "test",
      initialRules: [{ value: "red" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("AriaRenameClassInputSchema", () => {
  it("accepts valid rename", () => {
    const result = AriaRenameClassInputSchema.safeParse({
      oldName: "old-card",
      newName: "new-card",
    });
    expect(result.success).toBe(true);
  });

  it("rejects same old and new name", () => {
    const result = AriaRenameClassInputSchema.safeParse({
      oldName: "card",
      newName: "card",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid new name", () => {
    const result = AriaRenameClassInputSchema.safeParse({
      oldName: "card",
      newName: "Invalid!",
    });
    expect(result.success).toBe(false);
  });
});

describe("AriaDuplicateClassInputSchema", () => {
  it("accepts valid duplicate", () => {
    const result = AriaDuplicateClassInputSchema.safeParse({
      sourceName: "btn",
      newName: "btn-large",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid new name", () => {
    const result = AriaDuplicateClassInputSchema.safeParse({
      sourceName: "btn",
      newName: "BTN",
    });
    expect(result.success).toBe(false);
  });
});

describe("AriaDeleteClassInputSchema", () => {
  it("accepts valid delete request", () => {
    const result = AriaDeleteClassInputSchema.safeParse({
      name: "old-class",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = AriaDeleteClassInputSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("AriaUpdateClassRuleInputSchema", () => {
  it("accepts valid rule update", () => {
    const result = AriaUpdateClassRuleInputSchema.safeParse({
      className: "pricing-card",
      property: "padding",
      value: "24px",
    });
    expect(result.success).toBe(true);
    // Default breakpoint is "base"
    expect(result.data?.breakpoint).toBe("base");
  });

  it("accepts with custom breakpoint", () => {
    const result = AriaUpdateClassRuleInputSchema.safeParse({
      className: "card",
      breakpoint: "md",
      property: "padding",
      value: "32px",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing property", () => {
    const result = AriaUpdateClassRuleInputSchema.safeParse({
      className: "card",
      value: "16px",
    });
    expect(result.success).toBe(false);
  });
});

describe("AriaRemoveClassRuleInputSchema", () => {
  it("accepts valid rule removal", () => {
    const result = AriaRemoveClassRuleInputSchema.safeParse({
      className: "card",
      property: "padding",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing property", () => {
    const result = AriaRemoveClassRuleInputSchema.safeParse({
      className: "card",
    });
    expect(result.success).toBe(false);
  });
});

describe("AriaApplyClassToNodesInputSchema", () => {
  it("accepts valid apply request", () => {
    const result = AriaApplyClassToNodesInputSchema.safeParse({
      collection: "pages",
      slug: "home",
      className: "pricing-card",
      nodeIds: ["node-1", "node-2"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty nodeIds", () => {
    const result = AriaApplyClassToNodesInputSchema.safeParse({
      collection: "pages",
      slug: "home",
      className: "card",
      nodeIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid collection", () => {
    const result = AriaApplyClassToNodesInputSchema.safeParse({
      collection: "media" as never,
      slug: "home",
      className: "card",
      nodeIds: ["node-1"],
    });
    expect(result.success).toBe(false);
  });
});
