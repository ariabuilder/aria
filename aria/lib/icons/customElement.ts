import type { BuilderNode } from "../types/nodes";

export const ICONIFY_ICON_TAG_NAME = "iconify-icon";
export const ICONIFY_WEB_COMPONENT_CDN_URL = "";

export function nodesRequireIconifyRuntime(
  _nodes: readonly BuilderNode[],
): boolean {
  return false;
}

export function combineBuilderNodeSets(
  ...nodeSets: Array<readonly BuilderNode[] | null | undefined>
): BuilderNode[] {
  const combined: BuilderNode[] = [];

  for (const nodes of nodeSets) {
    if (!nodes || nodes.length === 0) {
      continue;
    }

    combined.push(...nodes);
  }

  return combined;
}

export function renderIconifyRuntimeHeadHtml(
  _nodes: readonly BuilderNode[],
): string {
  return "";
}
