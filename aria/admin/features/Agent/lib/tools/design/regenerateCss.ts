import { handleRegenerateGlobalCSS } from "../../../../../../actions/styles";
import {
  AriaRegenerateGlobalCssInputSchema,
  AriaRegenerateGlobalCssOutputSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import type { AgentToolActionContext } from "../types";

export async function ariaRegenerateGlobalCss(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "styles.regenerateGlobalCSS",
    inputSchema: AriaRegenerateGlobalCssInputSchema,
    outputSchema: AriaRegenerateGlobalCssOutputSchema,
    payload: input,
    handler: (_, actionContext) =>
      handleRegenerateGlobalCSS(undefined, actionContext),
  });
}
