import { z } from "zod";
import { redirects } from "../../../../../../actions/redirects";
import { hasEffectiveCapability } from "../../../../../../lib/auth";
import {
  AriaCreateRedirectInputSchema,
  AriaDeleteRedirectInputSchema,
  AriaListRedirectsInputSchema,
  AriaUpdateRedirectInputSchema,
  WriteSuccessSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { callDefinedAction } from "../callDefinedAction";
import type { ActionAPIContext } from "astro:actions";
import { toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";

function actionHandler(action: unknown) {
  return (payload: unknown, context: unknown) =>
    callDefinedAction(action, context as ActionAPIContext, payload);
}

function denyManageRedirects(
  context: AgentToolActionContext,
): AgentToolResult<never> | null {
  if (
    context.user &&
    !hasEffectiveCapability(context.user, "manageRedirects")
  ) {
    return toolErrorResult({
      code: "FORBIDDEN",
      message: "Your role cannot manage redirects.",
      suggestedFix: "Ask an administrator with manage redirects access.",
    });
  }
  return null;
}

export async function ariaListRedirects(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "redirects.list",
    inputSchema: AriaListRedirectsInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(redirects.list)(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaCreateRedirect(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denyManageRedirects(context);
  if (denied) return denied;

  return invokeActionHandlerForTool({
    context,
    operationId: "redirects.create",
    inputSchema: AriaCreateRedirectInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(redirects.create)(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaUpdateRedirect(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denyManageRedirects(context);
  if (denied) return denied;

  return invokeActionHandlerForTool({
    context,
    operationId: "redirects.update",
    inputSchema: AriaUpdateRedirectInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(redirects.update)(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaDeleteRedirect(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyManageRedirects(context);
  if (denied) return denied;

  return invokeActionHandlerForTool({
    context,
    operationId: "redirects.delete",
    inputSchema: AriaDeleteRedirectInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(redirects.delete)(validated, actionContext),
  });
}
