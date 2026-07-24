import { z } from "zod";
import {
  handleCreateClass,
  handleUpdateClassRule,
  handleRemoveClassRule,
  handleDeleteClass,
  handleRenameClass,
  handleDuplicateClass,
} from "../../../../../../actions/styles";
import { styles } from "../../../../../../actions/styles";
import {
  AriaCreateClassInputSchema,
  AriaUpdateClassRuleInputSchema,
  AriaRemoveClassRuleInputSchema,
  AriaDeleteClassInputSchema,
  AriaRenameClassInputSchema,
  AriaDuplicateClassInputSchema,
  AriaUpdateClassPseudoRuleInputSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { callDefinedAction } from "../callDefinedAction";
import type { ActionAPIContext } from "astro:actions";
import { toolErrorFromZod, toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";

export async function ariaCreateClass(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "styles.createClass",
    inputSchema: AriaCreateClassInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: (validated, actionContext) =>
      handleCreateClass(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaUpdateClassRule(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "styles.updateClassRule",
    inputSchema: AriaUpdateClassRuleInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: (validated, actionContext) =>
      handleUpdateClassRule(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaRemoveClassRule(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "styles.removeClassRule",
    inputSchema: AriaRemoveClassRuleInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: (validated, actionContext) =>
      handleRemoveClassRule(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaDeleteClass(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "styles.deleteClass",
    inputSchema: AriaDeleteClassInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: (validated, actionContext) =>
      handleDeleteClass(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaRenameClass(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaRenameClassInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid rename request", parsed.error.issues),
    );
  }

  const result = await invokeActionHandlerForTool({
    context,
    operationId: "styles.renameClass",
    inputSchema: AriaRenameClassInputSchema,
    outputSchema: z.any(),
    payload: parsed.data,
    handler: (validated, actionContext) =>
      handleRenameClass(validated, actionContext),
  });

  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    if (data) {
      data._warning =
        "Blocks referencing the old class name still use it. Use aria_apply_class_to_nodes to migrate individual nodes, or aria_regenerate_global_css to rebuild CSS.";
    }
  }

  return result as AgentToolResult<Record<string, unknown>>;
}

export async function ariaDuplicateClass(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "styles.duplicateClass",
    inputSchema: AriaDuplicateClassInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: (validated, actionContext) =>
      handleDuplicateClass(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

function actionHandler(action: unknown) {
  return (payload: unknown, context: unknown) =>
    callDefinedAction(action, context as ActionAPIContext, payload);
}

export async function ariaUpdateClassPseudoRule(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaUpdateClassPseudoRuleInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const action = parsed.data.remove
    ? styles.removeClassPseudoRule
    : styles.updateClassPseudoRule;
  const operationId = parsed.data.remove
    ? "styles.removeClassPseudoRule"
    : "styles.updateClassPseudoRule";

  return invokeActionHandlerForTool({
    context,
    operationId,
    inputSchema: AriaUpdateClassPseudoRuleInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(action)(
        {
          className: validated.className,
          state: validated.state,
          breakpoint: validated.breakpoint ?? "base",
          property: validated.property,
          value: validated.value,
          important: validated.important,
        },
        actionContext,
      ),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}
