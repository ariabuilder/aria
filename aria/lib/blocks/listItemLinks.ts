import { z } from "zod";

import type { BuilderNode, JsonObject } from "../types/nodes";
import {
  isLinkableContainerNodeType,
  normalizeContainerNodeType,
} from "./containerTypes";

export const ListItemLinkScopeSchema = z.enum(["row", "text"]);

export type ListItemLinkScope = z.infer<typeof ListItemLinkScopeSchema>;

export const TEXT_LINK_PROP_NAMES = [
  "href",
  "target",
  "rel",
  "title",
  "download",
] as const;

export const LIST_ITEM_LINK_PROP_NAMES = [
  ...TEXT_LINK_PROP_NAMES,
  "linkScope",
] as const;

const TEXT_LINK_WRAPPER_NODE_TYPES = new Set(["heading", "text", "paragraph"]);

export function isTextLinkWrapperNodeType(nodeType: string): boolean {
  return TEXT_LINK_WRAPPER_NODE_TYPES.has(
    normalizeContainerNodeType(nodeType).toLowerCase(),
  );
}

export function getLinkHref(props: JsonObject | undefined): string {
  const href = props?.href;
  return typeof href === "string" ? href.trim() : "";
}

export function hasLoopParentLinkConfig(node: BuilderNode): boolean {
  const hrefBinding = node.dataSource?.bindings?.href;
  if (typeof hrefBinding === "string" && hrefBinding.trim().length > 0) {
    return true;
  }
  return getLinkHref(node.props ?? {}).length > 0;
}

export function shouldWrapContainerChildrenInLink(node: BuilderNode): boolean {
  if (node.dataSource?.mode === "list" && hasLoopParentLinkConfig(node)) {
    return false;
  }
  return (
    isLinkableContainerNodeType(node.type ?? "") &&
    getLinkHref(node.props ?? {}).length > 0
  );
}

export function shouldStripContainerLinkWrapperProps(
  node: BuilderNode,
): boolean {
  return shouldWrapContainerChildrenInLink(node);
}

export function resolveListItemLinkScope(
  node: BuilderNode,
): ListItemLinkScope | null {
  if (
    normalizeContainerNodeType(node.type ?? "").toLowerCase() !== "listitem"
  ) {
    return null;
  }

  if (!getLinkHref(node.props ?? {})) {
    return null;
  }

  const explicitScope = ListItemLinkScopeSchema.safeParse(
    node.props?.linkScope,
  );
  if (explicitScope.success) {
    return explicitScope.data;
  }

  return hasDescendantNodeType(node, "icon") ? "row" : "text";
}

export function findListItemTextLinkChildIndex(node: BuilderNode): number {
  if (
    normalizeContainerNodeType(node.type ?? "").toLowerCase() !== "listitem"
  ) {
    return -1;
  }

  return node.children.findIndex((child) =>
    isTextLinkWrapperNodeType(child.type ?? ""),
  );
}

export function stripTextLinkWrapperPropsFromNode(
  node: BuilderNode,
): BuilderNode {
  const nextProps = { ...(node.props ?? {}) };

  if (isTextLinkWrapperNodeType(node.type ?? "")) {
    for (const propName of TEXT_LINK_PROP_NAMES) {
      delete nextProps[propName];
    }
  }

  return {
    ...node,
    props: nextProps,
    children: node.children.map(stripTextLinkWrapperPropsFromNode),
  };
}

export function stripLinkPropsForContainerWrapper(
  node: BuilderNode,
): BuilderNode {
  const nextProps = { ...(node.props ?? {}) };

  for (const propName of TEXT_LINK_PROP_NAMES) {
    delete nextProps[propName];
  }

  delete nextProps.url;

  return {
    ...node,
    props: nextProps,
    children: node.children.map(stripLinkPropsForContainerWrapper),
  };
}

function hasDescendantNodeType(node: BuilderNode, nodeType: string): boolean {
  for (const child of node.children) {
    if (
      normalizeContainerNodeType(child.type ?? "").toLowerCase() === nodeType
    ) {
      return true;
    }

    if (hasDescendantNodeType(child, nodeType)) {
      return true;
    }
  }

  return false;
}
