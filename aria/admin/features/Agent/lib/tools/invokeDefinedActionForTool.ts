import type { ActionAPIContext } from "astro:actions";
import type { AgentToolResult } from "../schemas";
import {
  mapActionErrorToToolError,
  toolErrorResult,
  toolSuccessResult,
} from "./toolErrors";
import { toToolActionContext } from "./toolActionContext";
import type { AgentToolActionContext } from "./types";

interface DefinedAction {
  orThrow: (this: ActionAPIContext, input: unknown) => Promise<unknown>;
}

/** Invoke the product's canonical Astro action, preserving its validation and auth. */
export async function invokeDefinedActionForTool(
  context: AgentToolActionContext,
  action: unknown,
  input: unknown,
): Promise<AgentToolResult<unknown>> {
  try {
    const defined = action as DefinedAction;
    const output = await defined.orThrow.call(
      toToolActionContext(context),
      input,
    );
    return toolSuccessResult(output);
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}
