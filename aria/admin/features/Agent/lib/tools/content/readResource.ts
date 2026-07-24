import { getAdapter } from "../../../../../../actions/_shared";
import { requireOperation } from "../../../../../../lib/auth";
import type {
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../../../lib/types/nodes";

type ReadCollection = "pages" | "layouts" | "components";
import type { AgentToolResult, ContentReadTarget } from "../../schemas";
import { mapActionErrorToToolError, toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { toToolActionContext } from "../toolActionContext";

export async function readResourceForTool(
  context: AgentToolActionContext,
  input: {
    collection: ReadCollection;
    slug: string;
    target: ContentReadTarget;
  },
): Promise<AgentToolResult<PageDSL | LayoutDSL | ComponentDSL>> {
  try {
    await requireOperation(toToolActionContext(context), "crud.getItem");
    const adapter = await getAdapter(toToolActionContext(context));

    let resource: PageDSL | LayoutDSL | ComponentDSL | null = null;

    switch (input.collection) {
      case "pages":
        resource =
          input.target === "published"
            ? await adapter.getPublishedPageDSL(input.slug)
            : await adapter.getPageDSL(input.slug);
        break;
      case "layouts":
        resource = await adapter.getLayoutDSL(input.slug);
        break;
      case "components":
        resource = await adapter.getComponentDSL(input.slug);
        break;
    }

    if (!resource) {
      const label = input.collection.slice(0, -1);
      const stage =
        input.collection === "pages" && input.target === "published"
          ? " (published)"
          : "";
      return toolErrorResult({
        code: "NOT_FOUND",
        message: `${label} not found: ${input.slug}${stage}`,
        suggestedFix:
          input.target === "published"
            ? "Try target=draft or publish the page first."
            : "Check the slug with aria_list_* tools.",
      });
    }

    return { ok: true, data: resource };
  } catch (error) {
    return toolErrorResult(mapActionErrorToToolError(error));
  }
}
