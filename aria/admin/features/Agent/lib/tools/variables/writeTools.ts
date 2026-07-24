import { z } from "zod";
import { getAdapter } from "../../../../../../actions/_shared";
import { getDesignSystem } from "../../../../../../actions/_designSystemPersist";
import { handleSaveGlobalStyles } from "../../../../../../actions/design-system";
import { toToolActionContext } from "../toolActionContext";
import {
  AriaManageCssVariablesInputSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import type { AgentToolActionContext } from "../types";
import { toolErrorFromZod, toolErrorResult } from "../toolErrors";

export async function ariaManageCssVariables(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaManageCssVariablesInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid CSS variable request", parsed.error.issues),
    );
  }

  // Read the FULL UniversalDesignSystem — do NOT use fetchDesignSystemForTools
  // which returns a flattened shape incompatible with saveGlobalStyles input.
  const actionContext = toToolActionContext(context);
  const adapter = await getAdapter(actionContext);
  const designSystemDoc = await getDesignSystem(adapter);

  // Patch variables.custom (CSS custom properties, keyed WITHOUT -- prefix)
  const currentCustom: Record<
    string,
    { label: string; value: string; category: string; description?: string }
  > = {};

  for (const [name, def] of Object.entries(
    designSystemDoc.globalStyles.variables.custom ?? {},
  )) {
    currentCustom[name] = { ...def };
  }

  if (parsed.data.variables) {
    for (const [name, value] of Object.entries(parsed.data.variables)) {
      const existing = currentCustom[name];
      currentCustom[name] = {
        label: existing?.label ?? name,
        value,
        category: (existing?.category ?? "custom") as string,
        description: existing?.description,
      };
    }
  }

  if (parsed.data.remove) {
    for (const name of parsed.data.remove) {
      delete currentCustom[name];
    }
  }

  designSystemDoc.globalStyles.variables.custom = currentCustom as Record<
    string,
    (typeof designSystemDoc.globalStyles.variables.custom)[string]
  >;

  // Save via saveGlobalStyles with the FULL GlobalStylesConfig
  return invokeActionHandlerForTool({
    context,
    operationId: "designSystem.saveGlobalStyles",
    inputSchema: z.object({}).optional(),
    outputSchema: z.unknown(),
    payload: {},
    handler: async () =>
      handleSaveGlobalStyles(
        { globalStyles: designSystemDoc.globalStyles },
        toToolActionContext(context),
      ),
  }) as Promise<AgentToolResult<Record<string, unknown>>>;
}
