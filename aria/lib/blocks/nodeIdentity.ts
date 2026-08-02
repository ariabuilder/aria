import { generateNodeId } from "../ids/nodeId";
import type { BuilderNode } from "../types/nodes";

export interface NodeIdentityRepair {
  previousId: string;
  nextId: string;
  path: readonly number[];
}

export interface UniqueNodeIdentityResult {
  nodes: BuilderNode[];
  repairs: readonly NodeIdentityRepair[];
  usedIds: ReadonlySet<string>;
}

export interface EnsureUniqueNodeIdentitiesOptions {
  reservedIds?: ReadonlySet<string>;
  createId?: () => string;
}

const createAvailableId = (
  usedIds: ReadonlySet<string>,
  createId: () => string,
): string => {
  let candidate = createId();
  while (usedIds.has(candidate)) {
    candidate = createId();
  }
  return candidate;
};

export function collectNodeIds(
  nodes: readonly BuilderNode[],
  target: Set<string> = new Set<string>(),
): Set<string> {
  for (const node of nodes) {
    target.add(node.id);
    collectNodeIds(node.children ?? [], target);
  }
  return target;
}

export function ensureUniqueNodeIdentities(
  nodes: readonly BuilderNode[],
  options: EnsureUniqueNodeIdentitiesOptions = {},
): UniqueNodeIdentityResult {
  const usedIds = new Set(options.reservedIds ?? []);
  const repairs: NodeIdentityRepair[] = [];
  const createId = options.createId ?? generateNodeId;

  const visit = (node: BuilderNode, path: readonly number[]): BuilderNode => {
    const hasCollision = usedIds.has(node.id);
    const nextId = hasCollision
      ? createAvailableId(usedIds, createId)
      : node.id;
    usedIds.add(nextId);

    if (hasCollision) {
      repairs.push({
        previousId: node.id,
        nextId,
        path,
      });
    }

    let childrenChanged = false;
    const nextChildren = (node.children ?? []).map((child, index) => {
      const nextChild = visit(child, [...path, index]);
      childrenChanged ||= nextChild !== child;
      return nextChild;
    });

    if (!hasCollision && !childrenChanged) {
      return node;
    }

    return {
      ...node,
      id: nextId,
      children: nextChildren,
    };
  };

  const nextNodes = nodes.map((node, index) => visit(node, [index]));

  return {
    nodes: nextNodes,
    repairs,
    usedIds,
  };
}

export function createNodeIdentityFingerprint(
  nodeGroups: readonly (readonly BuilderNode[])[],
): string {
  const project = (nodes: readonly BuilderNode[]): unknown[] =>
    nodes.map((node) => [node.id, project(node.children ?? [])]);

  return JSON.stringify(nodeGroups.map(project));
}
