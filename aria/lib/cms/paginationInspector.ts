import type { BuilderNode, NodeDataSource } from "../types/nodes";
import { NodeDataSourceSchema } from "../schemas/nodes";

export type PaginationListContainerOption = {
  id: string;
  label: string;
  limit?: number;
  collection?: string;
};

type PaginationListDataSource = NodeDataSource & {
  type: "cms" | "collection";
  mode: "list";
  collection: string;
};

function getListDataSource(node: BuilderNode): PaginationListDataSource | null {
  const parsed = NodeDataSourceSchema.safeParse(node.dataSource);
  if (!parsed.success) {
    return null;
  }
  const dataSource = parsed.data;
  if (!dataSource) {
    return null;
  }
  if (
    (dataSource.type === "cms" || dataSource.type === "collection") &&
    dataSource.mode === "list" &&
    Boolean(dataSource.collection)
  ) {
    return dataSource as PaginationListDataSource;
  }
  return null;
}

export function collectPaginationListContainers(
  nodes: readonly BuilderNode[],
): PaginationListContainerOption[] {
  const options: PaginationListContainerOption[] = [];

  function walk(currentNodes: readonly BuilderNode[]): void {
    for (const node of currentNodes) {
      const dataSource = getListDataSource(node);
      if (dataSource) {
        options.push({
          id: node.id,
          label: `${node.type ?? "Container"} · ${dataSource.collection}`,
          limit: dataSource.limit,
          collection: dataSource.collection,
        });
      }
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(nodes);
  return options;
}

export function findPaginationAutoConnectTarget(input: {
  pageBlocks: readonly BuilderNode[];
  parentId?: string | null;
  insertionIndex?: number;
}): string | null {
  const parentId = input.parentId ?? null;
  const siblings = parentId
    ? findNodeInTree(input.pageBlocks, parentId)?.children ?? []
    : [...input.pageBlocks];

  if (siblings.length === 0) {
    return collectPaginationListContainers(input.pageBlocks).at(-1)?.id ?? null;
  }

  const insertionIndex =
    typeof input.insertionIndex === "number" && input.insertionIndex >= 0
      ? Math.min(input.insertionIndex, siblings.length)
      : siblings.length;

  for (let index = insertionIndex - 1; index >= 0; index -= 1) {
    const sibling = siblings[index];
    if (sibling && getListDataSource(sibling)) {
      return sibling.id;
    }
  }

  const containers = collectPaginationListContainers(input.pageBlocks);
  return containers.length === 1 ? containers[0]?.id ?? null : null;
}

function findNodeInTree(
  nodes: readonly BuilderNode[],
  targetId: string,
): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }
    const nested = findNodeInTree(node.children, targetId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

export function resolvePaginationInheritedLimit(
  nodes: readonly BuilderNode[],
  targetNodeId: string | undefined,
): number | null {
  if (!targetNodeId) {
    return null;
  }
  const target = findNodeInTree(nodes, targetNodeId);
  if (!target) {
    return null;
  }
  const dataSource = getListDataSource(target);
  if (!dataSource) {
    return null;
  }
  return typeof dataSource.limit === "number" ? dataSource.limit : null;
}
