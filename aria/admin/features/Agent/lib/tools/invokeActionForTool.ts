import type { ActionAPIContext } from "astro:actions";
import type { z } from "zod";
import { requireOperation } from "../../../../../lib/auth";
import type { OperationId } from "../../../../../lib/auth/capabilityOperations";
import type { AgentToolResult } from "../schemas";
import {
  mapActionErrorToToolError,
  toolErrorFromZod,
  toolErrorResult,
  toolSuccessResult,
} from "./toolErrors";
import type { AgentToolActionContext } from "./types";
import { toToolActionContext } from "./toolActionContext";

export interface InvokeActionForToolOptions<TInput, TOutput> {
  context: AgentToolActionContext;
  operationId: OperationId;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  input: unknown;
  call: (
    validated: TInput,
    actionContext: ActionAPIContext,
  ) => Promise<unknown>;
}

export async function invokeActionForTool<TInput, TOutput>(
  options: InvokeActionForToolOptions<TInput, TOutput>,
): Promise<AgentToolResult<TOutput>> {
  const actionContext = toToolActionContext(options.context);

  try {
    await requireOperation(actionContext, options.operationId);
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }

  const parsedInput = options.inputSchema.safeParse(options.input);
  if (!parsedInput.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsedInput.error.issues),
    );
  }

  try {
    const raw = await options.call(parsedInput.data, actionContext);
    const parsedOutput = options.outputSchema.safeParse(raw);
    if (!parsedOutput.success) {
      return toolErrorResult(
        toolErrorFromZod("Invalid tool output", parsedOutput.error.issues),
      );
    }
    return toolSuccessResult(parsedOutput.data);
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}

export function unwrapActionEnvelope<T>(
  response: unknown,
  outputSchema: z.ZodType<T>,
): AgentToolResult<T> {
  if (
    response &&
    typeof response === "object" &&
    "success" in response &&
    (response as { success: boolean }).success === false
  ) {
    const err = response as { error?: { message?: string } };
    return toolErrorResult({
      code: "INTERNAL",
      message: err.error?.message ?? "Action failed",
    });
  }

  const data =
    response &&
    typeof response === "object" &&
    "data" in response &&
    (response as { data: unknown }).data !== undefined
      ? (response as { data: unknown }).data
      : response;

  const parsed = outputSchema.safeParse(data);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid action response", parsed.error.issues),
    );
  }

  return toolSuccessResult(parsed.data);
}
