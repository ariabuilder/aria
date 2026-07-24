import { z } from "zod";
import { settings } from "../../../../../../actions/settings";
import { hasEffectiveCapability } from "../../../../../../lib/auth";
import {
  AriaGetSiteSettingsInputSchema,
  AriaGetLocalizationSettingsInputSchema,
  AriaUpdateLocalizationSettingsInputSchema,
  AriaUpdateAppearanceInputSchema,
  AriaUpdateDiscoverySettingsInputSchema,
  AriaUpdateIconPacksInputSchema,
  AriaUpdateSiteSettingsInputSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { callDefinedAction } from "../callDefinedAction";
import type { ActionAPIContext } from "astro:actions";
import { toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { normalizeContentLocalization } from "../../../../../../lib/localization/contentLocale";

function actionHandler(action: unknown) {
  return (payload: unknown, context: unknown) =>
    callDefinedAction(action, context as ActionAPIContext, payload);
}

function denySiteSettings(
  context: AgentToolActionContext,
): AgentToolResult<never> | null {
  if (
    context.user &&
    !hasEffectiveCapability(context.user, "editSiteSettings")
  ) {
    return toolErrorResult({
      code: "FORBIDDEN",
      message: "Your role cannot update site settings.",
      suggestedFix: "Ask an administrator with edit site settings access.",
    });
  }
  return null;
}

function denyDiscoverySettings(
  context: AgentToolActionContext,
): AgentToolResult<never> | null {
  if (
    context.user &&
    !hasEffectiveCapability(context.user, "editDiscoverySettings")
  ) {
    return toolErrorResult({
      code: "FORBIDDEN",
      message: "Your role cannot update discovery settings.",
      suggestedFix: "Ask an administrator with edit discovery settings access.",
    });
  }
  return null;
}

export async function ariaGetSiteSettings(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  return invokeActionHandlerForTool({
    context,
    operationId: "settings.get",
    inputSchema: AriaGetSiteSettingsInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (_, actionContext) =>
      actionHandler(settings.get)({}, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaGetLocalizationSettings(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaGetLocalizationSettingsInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "Invalid localization settings request",
    });
  }
  const adapter =
    await import("../../../../../../lib/storage/getStorageAdapter").then(
      ({ getStorageAdapterAsync }) => getStorageAdapterAsync(context.locals),
    );
  const siteSettings = await adapter.getSiteSettings();
  return {
    ok: true,
    data: {
      ...normalizeContentLocalization(siteSettings?.localization?.content),
    },
  };
}

export async function ariaUpdateSiteSettings(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denySiteSettings(context);
  if (denied) return denied;

  return invokeActionHandlerForTool({
    context,
    operationId: "settings.update",
    inputSchema: AriaUpdateSiteSettingsInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(settings.update)(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaUpdateLocalizationSettings(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denySiteSettings(context);
  if (denied) return denied;

  return invokeActionHandlerForTool({
    context,
    operationId: "settings.update",
    inputSchema: AriaUpdateLocalizationSettingsInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(settings.update)(
        { localization: { content: validated } },
        actionContext,
      ),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaUpdateDiscoverySettings(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denyDiscoverySettings(context);
  if (denied) return denied;

  return invokeActionHandlerForTool({
    context,
    operationId: "settings.updateDiscovery",
    inputSchema: AriaUpdateDiscoverySettingsInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(settings.updateDiscovery)(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaUpdateAppearance(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denySiteSettings(context);
  if (denied) return denied;

  return invokeActionHandlerForTool({
    context,
    operationId: "settings.updateAppearance",
    inputSchema: AriaUpdateAppearanceInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(settings.updateAppearance)(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}

export async function ariaUpdateIconPacks(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const denied = denySiteSettings(context);
  if (denied) return denied;

  return invokeActionHandlerForTool({
    context,
    operationId: "settings.updateIcons",
    inputSchema: AriaUpdateIconPacksInputSchema,
    outputSchema: z.unknown(),
    payload: input,
    handler: async (validated, actionContext) =>
      actionHandler(settings.updateIcons)(validated, actionContext),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}
