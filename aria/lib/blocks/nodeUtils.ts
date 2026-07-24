/**
 * Utility functions for working with hierarchical node
 * trees. Immutable operations for tree manipulation.
 */

import type {
  BuilderNode,
  BreakpointDefinition,
  FlatNode,
  ValidationResult,
  ComponentDSL,
  PageDSL,
  LayoutDSL,
} from "../types/nodes";
import { BuilderNodeSchema } from "../schemas/nodes";
import { NodeMotionSchema } from "../motion/schemas/nodeMotion.schema";
import { generateNodeId as createNodeId } from "../ids/nodeId";
import { log } from "../utils/logger";

export function generateNodeId(): string {
  return createNodeId();
}

function createCircularReferencePlaceholder(
  node: BuilderNode,
  componentId: string,
): BuilderNode {
  return {
    id: node.id,
    type: "Container",
    className: "border border-red-500 p-4 bg-red-50",
    styles: {},
    props: {},
    children: [
      {
        id: `${node.id}-error`,
        type: "Text",
        props: {
          tag: "p",
          text: `⚠️ Circular reference detected: ${componentId}`,
        },
        className: "text-red-700 font-medium",
        styles: {},
        children: [],
      },
    ],
  };
}

export function getComponentReferenceId(node: BuilderNode): string | null {
  const referenceMasterId = node.reference?.masterId;
  if (typeof referenceMasterId === "string" && referenceMasterId.length > 0) {
    return referenceMasterId;
  }

  const referenceId = node.reference?.id;
  if (typeof referenceId === "string" && referenceId.length > 0) {
    return referenceId;
  }

  const propComponentId = node.props?.componentId;
  if (typeof propComponentId === "string" && propComponentId.length > 0) {
    return propComponentId;
  }

  return null;
}

/**
 * Collect unique component library IDs referenced in a node tree.
 */
export function collectComponentReferenceIds(
  nodes: readonly BuilderNode[],
): string[] {
  const ids = new Set<string>();

  const visit = (list: readonly BuilderNode[]): void => {
    for (const node of list) {
      const refId = getComponentReferenceId(node);
      if (refId) {
        ids.add(refId);
      }

      if (
        typeof node.componentRef === "string" &&
        node.componentRef.length > 0
      ) {
        ids.add(node.componentRef);
      }

      if (node.children.length > 0) {
        visit(node.children);
      }
    }
  };

  visit(nodes);
  return Array.from(ids);
}

function cloneStyleMap(styles: BuilderNode["styles"]): BuilderNode["styles"] {
  const cloned: BuilderNode["styles"] = {};

  for (const [key, value] of Object.entries(styles || {})) {
    cloned[key] = value ? { ...value } : value;
  }

  return cloned;
}

function flatNodeToBuilderNode(flatNode: FlatNode): BuilderNode {
  const nodeEntries = Object.entries(flatNode).filter(
    ([key]) => key !== "parentId" && key !== "index",
  );
  const nodeData = Object.fromEntries(nodeEntries) as unknown as BuilderNode;

  return {
    ...nodeData,
    id: String(flatNode.id),
    children: [],
  } as BuilderNode;
}

/**
 * Merge component settings into page/layout settings
 * Combines breakpoints and cssVariables from component DSL into parent
 */
export function mergeComponentSettings(
  parentSettings: PageDSL["settings"] | LayoutDSL["settings"],
  componentSettings?: ComponentDSL["settings"],
): PageDSL["settings"] | LayoutDSL["settings"] {
  if (!componentSettings) return parentSettings;

  const merged: NonNullable<PageDSL["settings"]> &
    Partial<NonNullable<LayoutDSL["settings"]>> = {
    ...(parentSettings ?? {}),
  };

  if (componentSettings.cssVariables) {
    merged.cssVariables = {
      ...(merged.cssVariables || {}),
      ...componentSettings.cssVariables,
    };
  }

  // Merge breakpoints (avoid duplicates by name)
  if (componentSettings.breakpoints) {
    const existingBreakpointNames = new Set(
      (merged.breakpoints || []).map((bp: BreakpointDefinition) => bp.name),
    );

    const newBreakpoints = componentSettings.breakpoints.filter(
      (bp) => !existingBreakpointNames.has(bp.name),
    );

    if (newBreakpoints.length > 0) {
      merged.breakpoints = [...(merged.breakpoints || []), ...newBreakpoints];
    }
  }

  return merged;
}

/**
 * Traverse a node tree and apply a callback to each node
 *
 * @param node - Root node to start traversal
 * @param callback - Function to call for each node
 * @param path - Current path in the tree (for internal use)
 */
export function traverseNodes(
  node: BuilderNode,
  callback: (node: BuilderNode, path: string[]) => void,
  path: string[] = [],
): void {
  callback(node, path);

  if (node.children && node.children.length > 0) {
    node.children.forEach((child, index) => {
      traverseNodes(child, callback, [
        ...path,
        node.id,
        "children",
        String(index),
      ]);
    });
  }
}

/**
 * Find a node by ID in the tree
 *
 * @param tree - Root node or array of root nodes
 * @param id - Node ID to find
 * @returns The found node or undefined
 */
export function findNodeById(
  tree: BuilderNode | BuilderNode[],
  id: string,
): BuilderNode | undefined {
  const nodes = Array.isArray(tree) ? tree : [tree];

  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    if (node.children && node.children.length > 0) {
      const found = findNodeById(node.children, id);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

/**
 * Find a node and its parent by ID
 *
 * @param tree - Root node or array of root nodes
 * @param id - Node ID to find
 * @returns Object with node and parent, or undefined
 */
export function findNodeWithParent(
  tree: BuilderNode | BuilderNode[],
  id: string,
):
  | { node: BuilderNode; parent: BuilderNode | null; index: number }
  | undefined {
  const nodes = Array.isArray(tree) ? tree : [tree];

  // Check if it's a root node
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      return { node: nodes[i], parent: null, index: i };
    }
  }

  // Search recursively with parent tracking
  function searchWithParent(
    nodes: BuilderNode[],
    parent: BuilderNode,
  ): { node: BuilderNode; parent: BuilderNode; index: number } | undefined {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === id) {
        return { node, parent, index: i };
      }

      if (node.children && node.children.length > 0) {
        const found = searchWithParent(node.children, node);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      const found = searchWithParent(node.children, node);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

/**
 * Update a node by ID (immutable)
 *
 * @param tree - Root nodes array
 * @param id - Node ID to update
 * @param updater - Function that returns updated node properties
 * @returns New tree with the updated node
 */
export function updateNodeById(
  tree: BuilderNode[],
  id: string,
  updater: (node: BuilderNode) => Partial<BuilderNode>,
): BuilderNode[] {
  return tree.map((node) => updateNodeRecursive(node, id, updater));
}

function updateNodeRecursive(
  node: BuilderNode,
  id: string,
  updater: (node: BuilderNode) => Partial<BuilderNode>,
): BuilderNode {
  if (node.id === id) {
    const updates = updater(node);
    return { ...node, ...updates };
  }

  if (node.children && node.children.length > 0) {
    return {
      ...node,
      children: node.children.map((child) =>
        updateNodeRecursive(child, id, updater),
      ),
    };
  }

  return node;
}

/**
 * Delete a node by ID (immutable)
 *
 * @param tree - Root nodes array
 * @param id - Node ID to delete
 * @returns New tree without the deleted node
 */
export function deleteNodeById(tree: BuilderNode[], id: string): BuilderNode[] {
  return tree
    .filter((node) => node.id !== id)
    .map((node) => deleteNodeRecursive(node, id));
}

function deleteNodeRecursive(node: BuilderNode, id: string): BuilderNode {
  if (!node.children || node.children.length === 0) {
    return node;
  }

  return {
    ...node,
    children: node.children
      .filter((child) => child.id !== id)
      .map((child) => deleteNodeRecursive(child, id)),
  };
}

/**
 * Delete multiple nodes by ID (immutable, single pass).
 *
 * Walks the tree once and removes all matching IDs in that single pass,
 * which is more efficient than calling `deleteNodeById` N times.
 *
 * @param tree - Root nodes array
 * @param ids - Node IDs to delete
 * @returns New tree without any of the deleted nodes
 */
export function deleteNodesById(
  tree: BuilderNode[],
  ids: string[],
): BuilderNode[] {
  if (ids.length === 0) return tree;
  const idSet = new Set(ids);

  const filterById = (nodes: BuilderNode[]): BuilderNode[] =>
    nodes
      .filter((node) => !idSet.has(node.id))
      .map((node) => {
        if (!node.children || node.children.length === 0) return node;
        return { ...node, children: filterById(node.children) };
      });

  return filterById(tree);
}

/**
 * Insert a node into the tree (immutable)
 *
 * @param tree - Root nodes array
 * @param parentId - Parent node ID (null for root level)
 * @param node - Node to insert
 * @param index - Position to insert at (default: end)
 * @returns New tree with the inserted node
 */
export function insertNode(
  tree: BuilderNode[],
  parentId: string | null,
  node: BuilderNode,
  index?: number,
): BuilderNode[] {
  if (parentId === null) {
    const insertIndex = index ?? tree.length;
    return [...tree.slice(0, insertIndex), node, ...tree.slice(insertIndex)];
  }

  // Insert into a parent node
  return tree.map((n) => insertNodeRecursive(n, parentId, node, index));
}

/**
 * Insert multiple nodes into the tree (immutable).
 *
 * Preserves the order of the provided nodes and inserts them contiguously.
 */
export function insertNodes(
  tree: BuilderNode[],
  parentId: string | null,
  nodes: BuilderNode[],
  index?: number,
): BuilderNode[] {
  if (nodes.length === 0) {
    return tree;
  }

  let nextTree = tree;
  let nextIndex = index;

  for (const node of nodes) {
    nextTree = insertNode(nextTree, parentId, node, nextIndex);
    if (typeof nextIndex === "number") {
      nextIndex += 1;
    }
  }

  return nextTree;
}

function insertNodeRecursive(
  node: BuilderNode,
  parentId: string,
  newNode: BuilderNode,
  index?: number,
): BuilderNode {
  if (node.id === parentId) {
    const children = node.children || [];
    const insertIndex = index ?? children.length;
    return {
      ...node,
      children: [
        ...children.slice(0, insertIndex),
        newNode,
        ...children.slice(insertIndex),
      ],
    };
  }

  if (node.children && node.children.length > 0) {
    return {
      ...node,
      children: node.children.map((child) =>
        insertNodeRecursive(child, parentId, newNode, index),
      ),
    };
  }

  return node;
}

/**
 * Move a node to a new parent (immutable)
 *
 * @param tree - Root nodes array
 * @param nodeId - Node to move
 * @param newParentId - New parent ID (null for root level)
 * @param index - Position in new parent's children
 * @returns New tree with the moved node
 */
export function moveNode(
  tree: BuilderNode[],
  nodeId: string,
  newParentId: string | null,
  index?: number,
): BuilderNode[] {
  // Find and extract the node
  const node = findNodeById(tree, nodeId);
  if (!node) {
    throw new Error(`Node with ID ${nodeId} not found`);
  }

  // Prevent moving a node into itself or its descendants
  if (newParentId && isDescendant(node, newParentId)) {
    throw new Error("Cannot move a node into itself or its descendants");
  }

  // Remove the node from its current position
  const treeWithoutNode = deleteNodeById(tree, nodeId);

  // Insert the node at the new position
  return insertNode(treeWithoutNode, newParentId, node, index);
}

/**
 * Check if a node is a descendant of another node
 */
function isDescendant(node: BuilderNode, ancestorId: string): boolean {
  if (node.id === ancestorId) {
    return true;
  }

  if (node.children && node.children.length > 0) {
    return node.children.some((child) => isDescendant(child, ancestorId));
  }

  return false;
}

/**
 * Flatten a node tree into an array with parent references
 *
 * @param tree - Root nodes array
 * @returns Array of flat nodes
 */
export function flattenNodes(tree: BuilderNode[]): FlatNode[] {
  const result: FlatNode[] = [];

  function flatten(nodes: BuilderNode[], parentId: string | null) {
    nodes.forEach((node, index) => {
      const { children, ...rest } = node;
      result.push({
        ...rest,
        parentId,
        index,
      });

      if (children && children.length > 0) {
        flatten(children, node.id);
      }
    });
  }

  flatten(tree, null);
  return result;
}

/**
 * Build a hierarchical tree from flat nodes
 *
 * @param flatNodes - Array of flat nodes
 * @returns Hierarchical tree structure
 */
export function buildNodeTree(flatNodes: FlatNode[]): BuilderNode[] {
  const nodeMap = new Map<string, BuilderNode>();
  const rootNodes: BuilderNode[] = [];

  // First pass: create all nodes
  flatNodes.forEach((flatNode) => {
    const nodeId = String(flatNode.id);
    nodeMap.set(nodeId, flatNodeToBuilderNode(flatNode));
  });

  // Second pass: build hierarchy
  flatNodes.forEach((flatNode) => {
    const nodeId = String(flatNode.id);
    const node = nodeMap.get(nodeId)!;

    if (flatNode.parentId === null) {
      rootNodes[flatNode.index] = node;
    } else {
      const parent = nodeMap.get(String(flatNode.parentId));
      if (parent) {
        parent.children[flatNode.index] = node;
      }
    }
  });

  return rootNodes.filter(Boolean); // Remove any holes in the array
}

/**
 * Deep clone a node (with or without children)
 *
 * @param node - Node to clone
 * @param deep - Whether to clone children recursively
 * @param generateNewIds - Whether to generate new IDs for cloned nodes
 * @returns Cloned node
 */
export function cloneNode(
  node: BuilderNode,
  deep: boolean = true,
  generateNewIds: boolean = false,
): BuilderNode {
  const cloned: BuilderNode = {
    ...node,
    id: generateNewIds ? generateNodeId() : node.id,
    props: { ...node.props },
    styles: cloneStyleMap(node.styles),
    children: [],
  };

  if (node.metadata) {
    cloned.metadata = { ...node.metadata };
  }

  if (node.hydration) {
    cloned.hydration = { ...node.hydration };
  }

  if (node.interactions) {
    cloned.interactions = {
      ...node.interactions,
      animations: node.interactions.animations
        ? [...node.interactions.animations]
        : undefined,
    };
  }

  if (node.variants) {
    cloned.variants = { ...node.variants };
  }

  if (node.a11y) {
    cloned.a11y = { ...node.a11y };
  }

  if (node.motion) {
    cloned.motion = NodeMotionSchema.parse(node.motion);
  }

  if (node.dataSource) {
    cloned.dataSource = {
      ...node.dataSource,
      filter: node.dataSource.filter
        ? { ...node.dataSource.filter }
        : undefined,
      bindings: node.dataSource.bindings
        ? { ...node.dataSource.bindings }
        : undefined,
      include: node.dataSource.include
        ? [...node.dataSource.include]
        : undefined,
      cache: node.dataSource.cache ? { ...node.dataSource.cache } : undefined,
      fallback: node.dataSource.fallback
        ? typeof node.dataSource.fallback === "object"
          ? { ...node.dataSource.fallback }
          : node.dataSource.fallback
        : undefined,
    };
  }

  if (node.reference) {
    cloned.reference = {
      ...node.reference,
      overrides: node.reference.overrides
        ? { ...node.reference.overrides }
        : undefined,
    };
  }

  if (deep && node.children && node.children.length > 0) {
    cloned.children = node.children.map((child) =>
      cloneNode(child, true, generateNewIds),
    );
  }

  return cloned;
}

/**
 * Validate a node tree structure
 *
 * @param tree - Root nodes array
 * @returns Validation result with any errors
 */
export function validateNodeTree(tree: BuilderNode[]): ValidationResult {
  const errors: ValidationResult["errors"] = [];
  const seenIds = new Set<string>();

  function validate(node: BuilderNode, path: string[]) {
    // Check for duplicate IDs
    if (seenIds.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: `Duplicate node ID: ${node.id}`,
        path,
      });
    } else {
      seenIds.add(node.id);
    }

    // Validate node structure with Zod
    const result = BuilderNodeSchema.safeParse(node);
    if (!result.success) {
      errors.push({
        nodeId: node.id,
        message: `Invalid node structure: ${result.error.message}`,
        path,
      });
    }

    if (node.children && node.children.length > 0) {
      node.children.forEach((child, index) => {
        validate(child, [...path, node.id, "children", String(index)]);
      });
    }
  }

  tree.forEach((node, index) => {
    validate(node, ["root", String(index)]);
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get all node IDs in a tree
 *
 * @param tree - Root nodes array
 * @returns Array of all node IDs
 */
export function getAllNodeIds(tree: BuilderNode[]): string[] {
  const ids: string[] = [];
  tree.forEach((node) => {
    traverseNodes(node, (n) => ids.push(n.id));
  });
  return ids;
}

/**
 * Count total nodes in a tree
 *
 * @param tree - Root nodes array
 * @returns Total number of nodes
 */
export function countNodes(tree: BuilderNode[]): number {
  let count = 0;
  tree.forEach((node) => {
    traverseNodes(node, () => count++);
  });
  return count;
}

/**
 * Get the depth of a node in the tree
 *
 * @param tree - Root nodes array
 * @param nodeId - Node ID to find depth of
 * @returns Depth (0 for root nodes) or -1 if not found
 */
export function getNodeDepth(tree: BuilderNode[], nodeId: string): number {
  let depth = -1;

  function findDepth(nodes: BuilderNode[], currentDepth: number): boolean {
    for (const node of nodes) {
      if (node.id === nodeId) {
        depth = currentDepth;
        return true;
      }

      if (node.children && node.children.length > 0) {
        if (findDepth(node.children, currentDepth + 1)) {
          return true;
        }
      }
    }
    return false;
  }

  findDepth(tree, 0);
  return depth;
}

/**
 * Get the path to a node (array of ancestor IDs)
 *
 * @param tree - Root nodes array
 * @param nodeId - Node ID to find path to
 * @returns Array of ancestor IDs, or empty array if not found
 */
export function getNodePath(tree: BuilderNode[], nodeId: string): string[] {
  const path: string[] = [];

  function findPath(nodes: BuilderNode[]): boolean {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return true;
      }

      if (node.children && node.children.length > 0) {
        path.push(node.id);
        if (findPath(node.children)) {
          return true;
        }
        path.pop();
      }
    }
    return false;
  }

  findPath(tree);
  return path;
}

/**
 * Filter nodes by predicate
 *
 * @param tree - Root nodes array
 * @param predicate - Function to test each node
 * @returns Array of nodes that match the predicate
 */
export function filterNodes(
  tree: BuilderNode[],
  predicate: (node: BuilderNode) => boolean,
): BuilderNode[] {
  const result: BuilderNode[] = [];
  tree.forEach((node) => {
    traverseNodes(node, (n) => {
      if (predicate(n)) {
        result.push(n);
      }
    });
  });
  return result;
}

/**
 * Map over all nodes in a tree (immutable)
 *
 * @param tree - Root nodes array
 * @param mapper - Function to transform each node
 * @returns New tree with transformed nodes
 */
export function mapNodes(
  tree: BuilderNode[],
  mapper: (node: BuilderNode) => BuilderNode,
): BuilderNode[] {
  return tree.map((node) => mapNodeRecursive(node, mapper));
}

function mapNodeRecursive(
  node: BuilderNode,
  mapper: (node: BuilderNode) => BuilderNode,
): BuilderNode {
  const mapped = mapper(node);

  if (mapped.children && mapped.children.length > 0) {
    return {
      ...mapped,
      children: mapped.children.map((child) => mapNodeRecursive(child, mapper)),
    };
  }

  return mapped;
}

/**
 * Expand component references in a node tree (client-side version)
 * Fetches component DSLs via API and inlines their nodes
 * Preserves styles, className, props, and all metadata
 *
 * @param nodes - Root nodes array
 * @param visitedComponents - Set of component IDs to prevent recursion
 * @returns Promise resolving to expanded nodes
 */
export async function expandComponentReferences(
  nodes: BuilderNode[],
  visitedComponents: Set<string> = new Set(),
): Promise<BuilderNode[]> {
  const expanded: BuilderNode[] = [];

  for (const node of nodes) {
    const componentRefId = getComponentReferenceId(node);

    if (node.type === "Component" && componentRefId) {
      const componentId = componentRefId;

      // Check for recursion
      if (visitedComponents.has(componentId)) {
        console.warn(
          `[expandComponentReferences] Recursion detected for component: ${componentId}`,
        );
        expanded.push(createCircularReferencePlaceholder(node, componentId));
        continue;
      }

      // Add to visited set
      const newVisited = new Set(visitedComponents);
      newVisited.add(componentId);

      try {
        const response = await fetch(
          `/api/storage/components?slug=${encodeURIComponent(componentId)}`,
        );

        console.log(
          "[expandComponentReferences] Fetching component:",
          componentId,
          "Status:",
          response.status,
        );

        if (response.ok) {
          const data = await response.json();

          // API returns component directly, not wrapped in {component: ...}
          const componentDSL = data;

          if (componentDSL?.nodes && componentDSL.nodes.length > 0) {
            // Recursively expand component's nodes with updated visited set
            const expandedComponentNodes = await expandComponentReferences(
              componentDSL.nodes,
              newVisited,
            );

            // Check if reference node has wrapper styles/props
            const hasWrapperStyles =
              (node.classNames &&
                Object.values(node.classNames).some(
                  (arr) => arr && arr.length > 0,
                )) ||
              (node.customClasses && node.customClasses.length > 0) ||
              (node.styles && Object.keys(node.styles).length > 0);
            const hasWrapperProps =
              node.props &&
              Object.keys(node.props).filter((k) => k !== "componentId")
                .length > 0;
            const hasReferenceOverrides = Boolean(node.reference?.overrides);

            if (hasWrapperStyles || hasWrapperProps || hasReferenceOverrides) {
              // Wrap component nodes in a container to preserve reference styles
              expanded.push({
                id: node.id,
                type: "Container",
                classNames: node.classNames,
                customClasses: node.customClasses,
                styles: node.styles || {},
                props: {
                  ...node.props,
                  "data-component-ref": componentId,
                },
                children: expandedComponentNodes,
                slot: node.slot,
                hydration: node.hydration,
                interactions: node.interactions,
                variants: node.variants,
                a11y: node.a11y,
                metadata: node.metadata,
              });
            } else {
              // No wrapper needed, inline nodes directly
              // Preserve slot assignment from reference if it exists
              if (node.slot) {
                expandedComponentNodes.forEach((n) => {
                  if (!n.slot) n.slot = node.slot;
                });
              }
              expanded.push(...expandedComponentNodes);
            }
          } else {
            console.warn(
              "[expandComponentReferences] Component has no nodes:",
              componentDSL,
            );
            // Fallback: keep original reference if component has no nodes
            expanded.push(node);
          }
        } else {
          // Fallback: keep original reference if fetch fails
          console.warn(
            `[expandComponentReferences] Failed to fetch component: ${componentId}`,
            response.status,
          );
          expanded.push(node);
        }
      } catch (error) {
        log(
          "error",
          `[expandComponentReferences] Error fetching component ${componentId}`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        expanded.push(node);
      }
    } else {
      // Not a component reference, process children recursively
      if (node.children && node.children.length > 0) {
        const expandedChildren = await expandComponentReferences(
          node.children,
          visitedComponents,
        );
        expanded.push({
          ...node,
          children: expandedChildren,
        });
      } else {
        expanded.push(node);
      }
    }
  }

  return expanded;
}

/**
 * Expand component references in a node tree (server-side version)
 * Uses storage adapter directly instead of HTTP
 * Preserves styles, className, props, and all metadata
 *
 * @param nodes - Root nodes array
 * @param getComponentDSL - Function to fetch component DSL from storage
 * @returns Promise resolving to expanded nodes
 */
export async function expandComponentReferencesServer(
  nodes: BuilderNode[],
  getComponentDSL: (id: string) => Promise<ComponentDSL | null | undefined>,
  visitedComponents: Set<string> = new Set(),
): Promise<BuilderNode[]> {
  const expanded: BuilderNode[] = [];

  for (const node of nodes) {
    const componentRefId = getComponentReferenceId(node);

    if (node.type === "Component" && componentRefId) {
      if (visitedComponents.has(componentRefId)) {
        log(
          "warn",
          `[expandComponentReferencesServer] Recursion detected for component: ${componentRefId}`,
        );
        expanded.push(createCircularReferencePlaceholder(node, componentRefId));
        continue;
      }

      try {
        const nextVisited = new Set(visitedComponents);
        nextVisited.add(componentRefId);
        const componentDSL = await getComponentDSL(componentRefId);

        if (componentDSL?.nodes && componentDSL.nodes.length > 0) {
          // Recursively expand component's nodes
          const expandedComponentNodes = await expandComponentReferencesServer(
            componentDSL.nodes,
            getComponentDSL,
            nextVisited,
          );

          // Always wrap component nodes in a container to preserve the component reference ID
          // This is necessary so that component selection works (the reference node ID must be in the DOM)
          expanded.push({
            id: node.id,
            type: "Container",
            classNames: node.classNames,
            customClasses: node.customClasses,
            styles: node.styles || {},
            props: {
              ...node.props,
              "data-component-ref": componentRefId,
            },
            children: expandedComponentNodes,
            slot: node.slot,
            hydration: node.hydration,
            interactions: node.interactions,
            variants: node.variants,
            a11y: node.a11y,
            metadata: node.metadata,
          });
        } else {
          expanded.push(node);
        }
      } catch (error) {
        log("error", `Error fetching component ${componentRefId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        expanded.push(node);
      }
    } else {
      // Not a component reference, process children recursively
      if (node.children && node.children.length > 0) {
        const expandedChildren = await expandComponentReferencesServer(
          node.children,
          getComponentDSL,
        );
        expanded.push({
          ...node,
          children: expandedChildren,
        });
      } else {
        expanded.push(node);
      }
    }
  }

  return expanded;
}
