import type { BuilderNode } from "../types/nodes";
import { normalizeNodeIcons } from "../icons/action-normalizers";
import { normalizeTypographyNode } from "./normalizeTypographyNode";
import { normalizeBuilderNodeClassFields } from "./normalizeBuilderNodeClasses";

/**
 * Normalizes a node tree before persistence (typography canonical types, then icons).
 */
export function normalizeNodeForPersist(node: BuilderNode): BuilderNode {
  return normalizeNodeIcons(
    normalizeTypographyNode(normalizeBuilderNodeClassFields(node).node),
  );
}

export function normalizeNodesForPersist(
  nodes: readonly BuilderNode[],
): BuilderNode[] {
  return nodes.map((node) => normalizeNodeForPersist(node));
}
