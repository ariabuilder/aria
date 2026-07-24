import type { BuilderNode } from "../types/nodes";
import { getCanonicalIconIdFromValue } from "./reference";

/** Collect canonical icon IDs without coupling callers to an icon provider. */
export function collectIconReferences(nodes: readonly BuilderNode[]): Set<string> {
  const ids = new Set<string>();
  const visit = (node: BuilderNode): void => {
    const icon = getCanonicalIconIdFromValue(node.props?.icon);
    if (icon) ids.add(icon);
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of nodes) visit(node);
  return ids;
}
