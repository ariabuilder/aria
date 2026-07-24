import { z } from "zod";
import {
  handleListGoogleFonts,
  handleGetFontConfig,
  handleEnableGoogleFont,
  handleDisableGoogleFont,
} from "../../../../../../actions/fonts";
import { fonts } from "../../../../../../actions/fonts";
import {
  AriaListFontsInputSchema,
  AriaGetFontConfigInputSchema,
  AriaEnableGoogleFontInputSchema,
  AriaDisableFontInputSchema,
  AriaDeleteCustomFontInputSchema,
  AriaRenameCustomFontInputSchema,
  AriaUpdateGoogleFontVariantsInputSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { callDefinedAction } from "../callDefinedAction";
import type { ActionAPIContext } from "astro:actions";
import type { AgentToolActionContext } from "../types";

export async function ariaListFonts(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "fonts.listGoogle",
    inputSchema: AriaListFontsInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: (validated, actionContext) =>
      handleListGoogleFonts(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaGetFontConfig(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "fonts.getConfig",
    inputSchema: AriaGetFontConfigInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: (_, actionContext) =>
      handleGetFontConfig(undefined, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaEnableGoogleFont(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "fonts.enableGoogle",
    inputSchema: AriaEnableGoogleFontInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: (validated, actionContext) =>
      handleEnableGoogleFont(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaDisableFont(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "fonts.disableGoogle",
    inputSchema: AriaDisableFontInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: (validated, actionContext) =>
      handleDisableGoogleFont(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

function actionHandler(action: unknown) {
  return (payload: unknown, context: unknown) =>
    callDefinedAction(action, context as ActionAPIContext, payload);
}

export async function ariaDeleteCustomFont(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "fonts.deleteCustom",
    inputSchema: AriaDeleteCustomFontInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(fonts.deleteCustom)(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaRenameCustomFont(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "fonts.renameCustom",
    inputSchema: AriaRenameCustomFontInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(fonts.renameCustom)(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaUpdateGoogleFontVariants(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "fonts.updateGoogleVariants",
    inputSchema: AriaUpdateGoogleFontVariantsInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(fonts.updateGoogleVariants)(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}
