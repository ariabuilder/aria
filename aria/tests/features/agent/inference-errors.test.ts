import { describe, expect, it } from "vitest";
import { InvalidToolInputError, NoSuchToolError } from "ai";
import { formatInferenceError } from "../../../admin/features/Agent/lib/inference/inferenceErrors";

describe("formatInferenceError", () => {
  it("extracts nested API error messages from AI SDK failures", () => {
    const error = Object.assign(new Error("APICallError"), {
      responseBody:
        '{"type":"error","error":{"type":"ModelError","message":"Model deepseek-v4-flash is not supported"}}',
      data: {
        error: {
          message: "Model deepseek-v4-flash is not supported",
        },
      },
    });

    expect(formatInferenceError(error)).toBe(
      "Model deepseek-v4-flash is not supported",
    );
  });

  it("falls back to Error.message when no nested payload exists", () => {
    expect(formatInferenceError(new Error("OpenCode credentials are not configured"))).toBe(
      "OpenCode credentials are not configured",
    );
  });

  it("sanitizes SDK tool-contract errors", () => {
    expect(
      formatInferenceError(
        new InvalidToolInputError({
          toolName: "aria_insert_nodes",
          toolInput: JSON.stringify({ nodes: "very large payload" }),
          cause: new Error("Type validation failed"),
        }),
      ),
    ).toBe(
      "aria_insert_nodes: Tool input was invalid and could not be repaired.",
    );
    expect(
      formatInferenceError(
        new NoSuchToolError({ toolName: "aria_missing_tool" }),
      ),
    ).toBe(
      "aria_missing_tool: The requested tool is unavailable in this context.",
    );
  });
});
