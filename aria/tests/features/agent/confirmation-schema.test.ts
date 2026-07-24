import { describe, expect, it } from "vitest";
import {
  AgentConfirmActionInputSchema,
  ConfirmationCategorySchema,
} from "../../../admin/features/Agent/lib/schemas";

describe("confirmation schemas", () => {
  it("parses confirmation category values", () => {
    expect(ConfirmationCategorySchema.parse("delete_content")).toBe(
      "delete_content",
    );
    expect(ConfirmationCategorySchema.parse("replace_variables")).toBe(
      "replace_variables",
    );
    expect(ConfirmationCategorySchema.parse("publish")).toBe("publish");
  });

  it("rejects invalid categories", () => {
    expect(() => ConfirmationCategorySchema.parse("invalid")).toThrow();
    expect(() => ConfirmationCategorySchema.parse("")).toThrow();
  });

  it("parses confirm action input with args", () => {
    const result = AgentConfirmActionInputSchema.parse({
      toolName: "aria_delete_document",
      args: { slug: "test" },
      confirmationToken: "token-123",
    });
    expect(result.toolName).toBe("aria_delete_document");
  });

  it("rejects retired always-allow fields", () => {
    expect(() =>
      AgentConfirmActionInputSchema.parse({
        toolName: "aria_delete_document",
        confirmationToken: "token-123",
        alwaysAllowCategory: "delete_content",
      }),
    ).toThrow();
  });

  it("parses confirm action input without args", () => {
    const result = AgentConfirmActionInputSchema.parse({
      toolName: "aria_delete_document",
      confirmationToken: "token-123",
    });
    expect(result.toolName).toBe("aria_delete_document");
    expect(result.args).toBeUndefined();
  });
});
