import { describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import {
  asToolActionHandler,
  callDefinedAction,
} from "../../../admin/features/Agent/lib/tools/callDefinedAction";
import { mapActionErrorToToolError } from "../../../admin/features/Agent/lib/tools/toolErrors";

const ACTION_API_CONTEXT_SYMBOL = Symbol.for("astro.actionAPIContext");

function makeContext(): ActionAPIContext {
  return {
    locals: {},
    request: new Request("https://aria.internal/test"),
  } as ActionAPIContext;
}

describe("callDefinedAction", () => {
  it("calls Astro 7 orThrow with ActionAPIContext as this", async () => {
    const context = makeContext();
    const orThrow = vi.fn(function (this: ActionAPIContext, input: unknown) {
      expect(this).toBe(context);
      expect(Reflect.get(this, ACTION_API_CONTEXT_SYMBOL)).toBe(true);
      return Promise.resolve({ ok: true, input });
    });

    const result = await callDefinedAction({ orThrow }, context, { id: "1" });
    expect(result).toEqual({ ok: true, input: { id: "1" } });
    expect(orThrow).toHaveBeenCalledOnce();
  });

  it("falls back to legacy { handler } for Vitest mocks", async () => {
    const context = makeContext();
    const handler = vi.fn(async (input: unknown, ctx: unknown) => {
      expect(ctx).toBe(context);
      return { listed: true, input };
    });

    const result = await callDefinedAction({ handler }, context, {
      collectionId: "blog",
    });
    expect(result).toEqual({
      listed: true,
      input: { collectionId: "blog" },
    });
  });

  it("asToolActionHandler adapts actions for invokeActionHandlerForTool", async () => {
    const context = makeContext();
    const orThrow = vi.fn(function (this: ActionAPIContext, input: unknown) {
      expect(this).toBe(context);
      return Promise.resolve({ created: input });
    });

    const adapted = asToolActionHandler({ orThrow });
    const result = await adapted({ title: "Post" }, context);
    expect(result).toEqual({ created: { title: "Post" } });
  });
});

describe("mapActionErrorToToolError", () => {
  it("preserves toolError payloads instead of remapping to INTERNAL", () => {
    const mapped = mapActionErrorToToolError(
      Object.assign(new Error("Invalid action response"), {
        code: "INVALID_INPUT",
        toolError: {
          code: "INVALID_INPUT" as const,
          message: "Invalid action response",
          suggestedFix: "Fix the input fields and retry.",
        },
      }),
    );
    expect(mapped.code).toBe("INVALID_INPUT");
    expect(mapped.message).toBe("Invalid action response");
  });
});
