import type { BuilderNode } from "../types/nodes";

function nodeRequiresNavRuntime(node: BuilderNode): boolean {
  const type = node.type.toLowerCase();
  return type === "navigation" || type === "nav-toggle";
}

export function requiresNavRuntime(nodes: readonly BuilderNode[]): boolean {
  const walk = (list: readonly BuilderNode[]): boolean => {
    for (const node of list) {
      if (nodeRequiresNavRuntime(node)) {
        return true;
      }
      if (node.children.length > 0 && walk(node.children)) {
        return true;
      }
    }
    return false;
  };

  return walk(nodes);
}

export function nodeTreeRequiresNavRuntime(
  ...nodeSets: Array<readonly BuilderNode[] | null | undefined>
): boolean {
  for (const nodes of nodeSets) {
    if (nodes && requiresNavRuntime(nodes)) {
      return true;
    }
  }
  return false;
}
