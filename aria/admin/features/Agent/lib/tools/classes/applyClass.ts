import { z } from "zod";
import { getAdapter } from "../../../../../../actions/_shared";
import { requireOperation } from "../../../../../../lib/auth";
import type { BuilderNode } from "../../../../../../lib/types/nodes";
import { handleUpdateItem } from "../../../../../../actions/crud";
import {
  AriaApplyClassToNodesInputSchema,
  AriaApplyClassToNodesOutputSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { toToolActionContext } from "../toolActionContext";
import type { AgentToolActionContext } from "../types";
import { toolErrorFromZod, toolErrorResult } from "../toolErrors";

interface DocumentData {
  title?: string;
  nodes?: BuilderNode[];
  version?: number;
  [key: string]: unknown;
}

function walkTree(
  nodes: BuilderNode[],
  targetIds: Set<string>,
  className: string,
  applied: Set<string>,
  skipped: Set<string>,
): BuilderNode[] {
  return nodes.map((node) => {
    if (targetIds.has(node.id)) {
      targetIds.delete(node.id);

      const customClasses = node.customClasses ?? [];
      if (customClasses.includes(className)) {
        skipped.add(node.id);
      } else {
        applied.add(node.id);
        return {
          ...node,
          customClasses: [...customClasses, className],
          children: node.children
            ? walkTree(
                node.children as BuilderNode[],
                targetIds,
                className,
                applied,
                skipped,
              )
            : node.children,
        };
      }
    }

    if (node.children && Array.isArray(node.children)) {
      return {
        ...node,
        children: walkTree(
          node.children as BuilderNode[],
          targetIds,
          className,
          applied,
          skipped,
        ),
      };
    }

    return node;
  });
}

export async function ariaApplyClassToNodes(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<Record<string, unknown>>> {
  const parsed = AriaApplyClassToNodesInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid apply-class request", parsed.error.issues),
    );
  }

  const { collection, slug, className, nodeIds } = parsed.data;

  try {
    // Read current document via adapter (follows readResourceForTool pattern)
    const actionContext = toToolActionContext(context);
    await requireOperation(actionContext, "crud.getItem");
    const adapter = await getAdapter(actionContext);

    let doc: DocumentData | null = null;
    switch (collection) {
      case "pages":
        doc = (await adapter.getPageDSL(slug)) as DocumentData | null;
        break;
      case "layouts":
        doc = (await adapter.getLayoutDSL(slug)) as DocumentData | null;
        break;
      case "components":
        doc = (await adapter.getComponentDSL(slug)) as DocumentData | null;
        break;
    }

    if (!doc?.nodes || !Array.isArray(doc.nodes)) {
      return toolErrorResult({
        code: "NOT_FOUND",
        message: `Document ${collection}/${slug} not found or has no nodes`,
      });
    }

    const targetIdSet = new Set(nodeIds);
    const applied = new Set<string>();
    const skipped = new Set<string>();

    const updatedNodes = walkTree(
      doc.nodes,
      targetIdSet,
      className,
      applied,
      skipped,
    );

    // Any IDs still in targetIdSet were not found
    const notFound = Array.from(targetIdSet);

    // Save via crud.updateItem action
    const actionCtx = toToolActionContext(context);
    return invokeActionHandlerForTool({
      context,
      operationId: "crud.updateItem",
      inputSchema: z.object({}).optional(),
      outputSchema: AriaApplyClassToNodesOutputSchema,
      payload: {},
      handler: async () =>
        handleUpdateItem(
          {
            collection,
            slug,
            data: { nodes: updatedNodes, title: doc.title } as Record<
              string,
              unknown
            >,
          },
          actionCtx,
        ),
    }).then((result) => {
      if (result.ok) {
        return {
          ok: true as const,
          data: {
            applied: applied.size,
            skipped: skipped.size,
            notFound,
          },
        };
      }
      return result;
    });
  } catch (err) {
    return toolErrorResult({
      code: "NOT_FOUND",
      message:
        err instanceof Error
          ? err.message
          : `Failed to apply class to ${collection}/${slug}`,
    });
  }
}
