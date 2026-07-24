import { generateNodeId } from "../../../../../lib/ids/nodeId";
import { normalizeContainerNodeType } from "../../../../../lib/blocks/containerTypes";
import { StyleMapSchema } from "../../../../../lib/schemas/nodes";
import type { BuilderNode } from "../../../../../lib/types/nodes";
import { isJsonObject } from "../../../../../lib/types/nodes";
import { cloneDeep } from "../../../Core";

export { cloneDeep };

export type ParentIndexResult = {
  parent: BuilderNode | null;
  index: number;
} | null;

export const findParentAndIndex = (
  nodes: BuilderNode[],
  targetId: string,
  parent: BuilderNode | null = null,
): ParentIndexResult => {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === targetId) return { parent, index };
    if (node.children?.length) {
      const found = findParentAndIndex(node.children, targetId, node);
      if (found) return found;
    }
  }
  return null;
};

export const findParentAndIndexInRoots = findParentAndIndex;

export const normalizeBuilderNode = (
  source: Partial<BuilderNode>,
  fallbackType: string,
  slot?: string,
): BuilderNode => {
  const props = isJsonObject(source.props) ? source.props : {};
  const parsedStyles = StyleMapSchema.safeParse(source.styles);
  const styles =
    parsedStyles.success && parsedStyles.data ? parsedStyles.data : {};
  const children = Array.isArray(source.children)
    ? source.children.map((child) =>
        normalizeBuilderNode(
          child,
          typeof child.type === "string" && child.type.length > 0
            ? child.type
            : "Container",
        ),
      )
    : [];
  const resolvedType =
    typeof source.type === "string" && source.type.length > 0
      ? source.type
      : fallbackType;

  return {
    ...source,
    id: source.id ?? generateNodeId(),
    type: normalizeContainerNodeType(resolvedType),
    props,
    styles,
    children,
    slot: slot ?? source.slot,
  };
};

export const isComponentInstance = (
  node: BuilderNode | null | undefined,
): boolean => {
  if (!node) return false;
  return (
    node.type === "Component" ||
    Boolean(node.componentRef) ||
    Boolean(node.reference?.masterId) ||
    node.reference?.type === "instance"
  );
};
