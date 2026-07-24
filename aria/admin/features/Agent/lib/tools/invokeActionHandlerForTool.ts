import type { ActionAPIContext } from "astro:actions";
import type { z } from "zod";
import type { OperationId } from "../../../../../lib/auth/capabilityOperations";
import type { AgentToolResult } from "../schemas";
import { mapActionErrorToToolError } from "./toolErrors";
import {
  invokeActionForTool,
  unwrapActionEnvelope,
} from "./invokeActionForTool";
import type { AgentToolActionContext } from "./types";
import { asToolActionHandler } from "./callDefinedAction";

function unwrapActionHandlerResult<T>(
  raw: unknown,
  outputSchema: z.ZodType<T>,
): AgentToolResult<T> {
  if (
    raw &&
    typeof raw === "object" &&
    "success" in raw &&
    (raw as { success: boolean }).success === false
  ) {
    const failure = raw as {
      error?: { message?: string; code?: string };
    };
    return {
      ok: false,
      error: mapActionErrorToToolError({
        code: failure.error?.code ?? "INTERNAL",
        message: failure.error?.message ?? "Action failed",
      }),
    };
  }

  return unwrapActionEnvelope(raw, outputSchema);
}

export async function invokeActionHandlerForTool<TInput, TOutput>(input: {
  context: AgentToolActionContext;
  operationId: OperationId;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  payload: unknown;
  /** Prefer `action` for Astro defineAction results; `handler` for custom wrappers. */
  action?: unknown;
  handler?: (
    validated: TInput,
    actionContext: ActionAPIContext,
  ) => Promise<unknown>;
}): Promise<AgentToolResult<TOutput>> {
  const handler =
    input.handler ??
    (input.action != null
      ? (asToolActionHandler(input.action) as (
          validated: TInput,
          actionContext: ActionAPIContext,
        ) => Promise<unknown>)
      : null);

  if (!handler) {
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "invokeActionHandlerForTool requires action or handler",
      },
    };
  }

  return invokeActionForTool({
    context: input.context,
    operationId: input.operationId,
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    input: input.payload,
    call: async (validated, actionContext) => {
      const raw = await handler(validated, actionContext);
      const unwrapped = unwrapActionHandlerResult(raw, input.outputSchema);
      // Return data only — invokeActionForTool re-validates with outputSchema.
      // Do not throw on unwrap failure; rethrowing remaps INVALID_INPUT → INTERNAL.
      if (!unwrapped.ok) {
        throw Object.assign(new Error(unwrapped.error.message), {
          code: unwrapped.error.code,
          toolError: unwrapped.error,
        });
      }
      return unwrapped.data;
    },
  });
}
