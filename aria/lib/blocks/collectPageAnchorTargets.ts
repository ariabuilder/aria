import type { BuilderNode } from "../types/nodes";
import { normalizeDomId } from "./domId";

export interface PageAnchorTarget {
  /** props.id — the value used in #href */
  id: string;
  label: string;
}

/**
 * Collect anchor targets from page/layout node trees. Only nodes with a non-empty `props.
 */
export function collectPageAnchorTargets(
  roots: readonly BuilderNode[],
): PageAnchorTarget[] {
  const seen = new Map<string, PageAnchorTarget>();

  function walk(nodes: readonly BuilderNode[]): void {
    for (const node of nodes) {
      const rawId =
        typeof node.props?.id === "string" ? node.props.id : "";
      const id = normalizeDomId(rawId);

      if (id && !seen.has(id)) {
        seen.set(id, {
          id,
          label: node.metadata?.label ?? node.type,
        });
      }

      if (node.children?.length) {
        walk(node.children);
      }
    }
  }

  walk(roots);

  return Array.from(seen.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}
