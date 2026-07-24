import { getAdapter } from "../../../../../../actions/_shared";
import type { AgentToolResult } from "../../schemas";
import { mapActionErrorToToolError, toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { toToolActionContext } from "../toolActionContext";

export async function fetchLayoutComponentCatalogForTools(
  context: AgentToolActionContext,
): Promise<
  AgentToolResult<{ layouts: unknown[]; components: unknown[] }>
> {
  try {
    const adapter = await getAdapter(toToolActionContext(context));
    const [layouts, components] = await Promise.all([
      adapter.listLayoutsDSL(),
      adapter.listComponentsDSL(),
    ]);
    return {
      ok: true,
      data: {
        layouts: layouts ?? [],
        components: components ?? [],
      },
    };
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}
