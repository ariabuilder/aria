import { actions } from "astro:actions";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type { RenderCmsDataOptions } from "../../../../lib/cms/resolveBoundNodes";

export async function resolveCmsCanvasBlocks(
  blocks: readonly BuilderNode[],
  input: {
    basePath: string;
    cms?: RenderCmsDataOptions;
  },
): Promise<BuilderNode[]> {
  const hasCmsSources = blocks.some(function walk(node): boolean {
    if (node.dataSource?.type === "cms" || node.dataSource?.type === "collection") {
      return true;
    }
    if (node.dataSource?.type === "pagination") {
      return true;
    }
    return node.children?.some(walk) ?? false;
  });

  if (!hasCmsSources && !input.cms?.entryContext) {
    return [...blocks];
  }

  const result = await actions.cms.resolvePageNodes.resolve({
    nodes: [...blocks],
    basePath: input.basePath,
    cms: input.cms ?? { preview: true },
  });

  if (result.error || !result.data) {
    return [...blocks];
  }

  return result.data.nodes;
}
