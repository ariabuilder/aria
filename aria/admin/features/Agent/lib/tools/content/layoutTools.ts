import { handleUpdateItem } from "../../../../../../actions/crud";
import { layouts } from "../../../../../../actions/layouts";
import type { LayoutDSL } from "../../../../../../lib/types/nodes";
import { hasEffectiveCapability } from "../../../../../../lib/auth";
import {
  AriaUpdateLayoutSlotsInputSchema,
  WriteSuccessSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { callDefinedAction } from "../callDefinedAction";
import type { ActionAPIContext } from "astro:actions";
import { toolErrorFromZod, toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { toToolActionContext } from "../toolActionContext";
import { readResourceForTool } from "./readResource";
import { denyUtilityClassesWhenDisabled } from "./utilityClassPolicy";

function denyPageWrites(
  context: AgentToolActionContext,
): AgentToolResult<never> | null {
  if (context.user && !hasEffectiveCapability(context.user, "editPages")) {
    return toolErrorResult({
      code: "FORBIDDEN",
      message: "Your role cannot modify layouts.",
      suggestedFix: "Ask an administrator with page edit access.",
    });
  }
  return null;
}

function actionHandler(action: unknown) {
  return (payload: unknown, context: unknown) =>
    callDefinedAction(action, context as ActionAPIContext, payload);
}

export async function ariaUpdateLayoutSlots(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaUpdateLayoutSlotsInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const utilityClassesDenied = await denyUtilityClassesWhenDisabled(
    context,
    parsed.data.slotNodes ?? parsed.data.slots,
  );
  if (utilityClassesDenied) return utilityClassesDenied;

  const actionContext = toToolActionContext(context);

  if (parsed.data.slotName && parsed.data.slotNodes) {
    return invokeActionHandlerForTool({
      context,
      operationId: "layouts.updateSlotContent",
      inputSchema: AriaUpdateLayoutSlotsInputSchema,
      outputSchema: WriteSuccessSchema,
      payload: parsed.data,
      handler: async () =>
        actionHandler(layouts.updateSlotContent)(
          {
            layoutSlug: parsed.data.layoutSlug,
            slotName: parsed.data.slotName,
            nodes: parsed.data.slotNodes,
          },
          actionContext,
        ),
    });
  }

  const read = await readResourceForTool(context, {
    collection: "layouts",
    slug: parsed.data.layoutSlug,
    target: "draft",
  });
  if (!read.ok) return read;

  const layout = read.data as unknown as LayoutDSL;
  const nextLayout: LayoutDSL = {
    ...layout,
    slots: parsed.data.slots as LayoutDSL["slots"],
    updatedAt: new Date().toISOString(),
  };

  return invokeActionHandlerForTool({
    context,
    operationId: "crud.updateItem",
    inputSchema: AriaUpdateLayoutSlotsInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () =>
      handleUpdateItem(
        {
          collection: "layouts",
          slug: parsed.data.layoutSlug,
          data: nextLayout as unknown as Record<string, unknown>,
        },
        actionContext,
      ),
  });
}
