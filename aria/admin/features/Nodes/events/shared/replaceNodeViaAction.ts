import { actions } from "astro:actions";
import type { BuilderNode } from "../../../../../lib/types/nodes";
import {
  ReplaceNodeActionInputSchema,
  ReplaceNodeActionResultSchema,
} from "../../swap/nodeSwapSchemas";

export type ReplaceNodeMutationPath = {
  collection: "pages" | "layouts" | "components";
  id: string;
};

export type ReplaceNodeViaActionResult =
  | { ok: true; version: string }
  | { ok: false; message: string };

export async function replaceNodeViaAction(params: {
  mutationPath: ReplaceNodeMutationPath;
  node: BuilderNode;
}): Promise<ReplaceNodeViaActionResult> {
  const parsedInput = ReplaceNodeActionInputSchema.safeParse({
    collection: params.mutationPath.collection,
    id: params.mutationPath.id,
    nodeId: params.node.id,
    node: params.node,
  });

  if (!parsedInput.success) {
    return {
      ok: false,
      message:
        parsedInput.error.issues[0]?.message ?? "Invalid node replacement",
    };
  }

  const response = await actions.replaceNode(parsedInput.data);

  if (response.error) {
    return {
      ok: false,
      message: response.error.message ?? "Failed to replace node",
    };
  }

  const parsedResult = ReplaceNodeActionResultSchema.safeParse(response.data);
  if (!parsedResult.success) {
    return {
      ok: false,
      message: "Replace node returned an invalid response",
    };
  }

  return { ok: true, version: parsedResult.data.version };
}
