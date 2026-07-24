import { getAdapter } from "../../../../../../actions/_shared";
import { getDesignSystem } from "../../../../../../actions/_designSystemPersist";
import type { AgentToolResult } from "../../schemas";
import { toToolActionContext } from "../toolActionContext";
import type { AgentToolActionContext } from "../types";
import { mapActionErrorToToolError, toolErrorResult } from "../toolErrors";

export async function ariaListClasses(
  context: AgentToolActionContext,
  _input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  try {
    const actionContext = toToolActionContext(context);
    const adapter = await getAdapter(actionContext);
    const designSystemDoc = await getDesignSystem(adapter);

    const classes = Object.entries(designSystemDoc.semanticClasses ?? {}).map(
      ([name, cls]) => ({
        name,
        description: cls.description ?? null,
        variantCount: cls.variants?.length ?? 0,
        pseudoVariantCount: cls.pseudoVariants?.length ?? 0,
        usageCount: cls.usageCount ?? 0,
      }),
    );

    return {
      ok: true,
      data: {
        classes,
        total: classes.length,
      },
    };
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}
