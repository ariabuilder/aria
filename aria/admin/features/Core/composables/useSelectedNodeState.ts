import { computed, inject, type ComputedRef } from "vue";

import type {
  BuilderNode,
  NodeDataSource,
  NodeAccessibility,
} from "../../../../lib/types/nodes";
import type { NodeMotion } from "../../../../lib/motion/schemas/nodeMotion.schema";
import { NodeMotionSchema } from "../../../../lib/motion/schemas/nodeMotion.schema";
import {
  createEmptyClassNames,
  NodeClassNamesSchema,
  type NodeClassNames,
} from "../../../../lib/schemas/classEditor";
import { BuilderNodeSchema } from "../../../../lib/schemas/nodes";
import { useBeacon } from "../../Beacon";

import { useSelectionTreeState } from "./useSelectionTreeState";
import { APP_INJECTION_KEYS } from "../types/injectionKeys";
import type { EditorNodeRegistry } from "../types/injectionKeys";

function isBuilderNode(value: unknown): value is BuilderNode {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof (value as { id?: unknown }).id === "string",
  );
}

type SelectionTreeRootNodesRef = { value: BuilderNode[] };

function findNodeInTree(
  nodes: readonly unknown[],
  id: string,
): BuilderNode | null {
  for (const node of nodes) {
    if (!isBuilderNode(node)) {
      continue;
    }

    if (node.id === id) {
      return node;
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      const found = findNodeInTree(node.children, id);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function patchNodeInTree(
  nodes: BuilderNode[],
  nodeId: string,
  patch: (node: BuilderNode) => void,
): BuilderNode | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];

    if (node.id === nodeId) {
      patch(node);
      return node;
    }

    if (node.children.length > 0) {
      const found = patchNodeInTree(node.children, nodeId, patch);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function mergeNodeStyles(
  node: BuilderNode,
  styles: Partial<BuilderNode["styles"]>,
): void {
  const nextStyles = {
    ...(node.styles ?? {}),
  } as NonNullable<BuilderNode["styles"]>;

  for (const [property, responsiveValues] of Object.entries(styles)) {
    if (!responsiveValues || typeof responsiveValues !== "object") {
      continue;
    }

    const currentResponsiveValues = nextStyles[property];
    const mergedResponsiveValues = {
      ...(currentResponsiveValues && typeof currentResponsiveValues === "object"
        ? currentResponsiveValues
        : {}),
    } as Record<string, unknown>;

    for (const [breakpoint, value] of Object.entries(responsiveValues)) {
      if (value === undefined) {
        delete mergedResponsiveValues[breakpoint];
        continue;
      }

      mergedResponsiveValues[breakpoint] = value;
    }

    if (Object.keys(mergedResponsiveValues).length === 0) {
      delete nextStyles[property];
      continue;
    }

    nextStyles[property] = mergedResponsiveValues as NonNullable<
      BuilderNode["styles"]
    >[keyof NonNullable<BuilderNode["styles"]>];
  }

  node.styles = nextStyles;
}

function mergeNodeA11y(
  node: BuilderNode,
  a11y: Partial<NonNullable<NodeAccessibility>>,
): void {
  const nextA11y = {
    ...(node.a11y ?? {}),
  } as NonNullable<NodeAccessibility>;

  for (const [key, value] of Object.entries(a11y)) {
    if (value === undefined) {
      delete nextA11y[key as keyof NonNullable<NodeAccessibility>];
      continue;
    }

    nextA11y[key as keyof NonNullable<NodeAccessibility>] =
      value as NonNullable<NodeAccessibility>[keyof NonNullable<NodeAccessibility>];
  }

  if (Object.keys(nextA11y).length === 0) {
    delete node.a11y;
    return;
  }

  node.a11y = nextA11y;
}

function mergeNodeMetadata(
  node: BuilderNode,
  metadata: BuilderNode["metadata"],
): void {
  if (metadata === undefined) {
    delete node.metadata;
    return;
  }

  node.metadata = { ...metadata };
}

function mergeNodeMotion(node: BuilderNode, motion: NodeMotion): void {
  const parsed = NodeMotionSchema.safeParse(motion);
  if (!parsed.success) {
    return;
  }

  if (!parsed.data.enabled && parsed.data.effects.length === 0) {
    delete node.motion;
    return;
  }

  node.motion = parsed.data;
}

function mergeNodeDataSource(
  node: BuilderNode,
  dataSource: NodeDataSource | null,
): void {
  if (dataSource === null) {
    delete node.dataSource;
    return;
  }

  node.dataSource = dataSource;
}

function mergeNodeProps(
  node: BuilderNode,
  props: Partial<BuilderNode["props"]>,
): void {
  const nextProps = {
    ...(node.props ?? {}),
  };

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) {
      delete nextProps[key];
      continue;
    }

    nextProps[key] = value;
  }

  node.props = nextProps;
}

export function useSelectedNodeState() {
  const {
    focusedNodeId,
    primarySelectedNodeId,
    selectedNodeIds,
    selectionAnchorNodeId,
  } = useBeacon();
  const { selectionTreeRootNodes: rawSelectionTreeRootNodes } =
    useSelectionTreeState();
  const selectionTreeRootNodes =
    rawSelectionTreeRootNodes as unknown as SelectionTreeRootNodesRef;
  const editorNodeRegistry = inject<EditorNodeRegistry | null>(
    APP_INJECTION_KEYS.editorNodeRegistry,
    null,
  );

  function resolveNode(nodeId: string): BuilderNode | null {
    const fromSelectionTree = findNodeInTree(
      selectionTreeRootNodes.value,
      nodeId,
    );
    if (fromSelectionTree) {
      return fromSelectionTree;
    }

    return editorNodeRegistry?.findNode(nodeId) ?? null;
  }

  function patchSelectedNode(
    nodeId: string,
    patch: (node: BuilderNode) => void,
  ): BuilderNode | null {
    const fromSelectionTree = patchNodeInTree(
      selectionTreeRootNodes.value,
      nodeId,
      patch,
    );
    if (fromSelectionTree) {
      return fromSelectionTree;
    }

    return editorNodeRegistry?.patchNodeInRegistry(nodeId, patch) ?? null;
  }

  const primarySelectedNode: ComputedRef<BuilderNode | null> = computed(() => {
    const nodeId = primarySelectedNodeId.value;
    if (!nodeId) {
      return null;
    }

    return resolveNode(nodeId);
  });

  const selectedNodes = computed(() =>
    selectedNodeIds.value
      .map((nodeId) => resolveNode(nodeId))
      .filter((node): node is BuilderNode => node !== null),
  );

  const selectionCount = computed(() => selectedNodes.value.length);
  const isMultiSelect = computed(() => selectionCount.value > 1);

  function updateSelectedNodeClassNames(
    nodeId: string,
    classNames: NodeClassNames,
  ): BuilderNode | null {
    const parsedClassNames = NodeClassNamesSchema.safeParse(classNames);
    if (!parsedClassNames.success) {
      return null;
    }

    return patchSelectedNode(nodeId, (node) => {
      const nextClassNames = createEmptyClassNames();

      for (const [key, value] of Object.entries(parsedClassNames.data)) {
        nextClassNames[key] = [...value];
      }

      node.classNames = nextClassNames;
    });
  }

  function updateSelectedNodeCustomClasses(
    nodeId: string,
    customClasses: string[],
  ): BuilderNode | null {
    return patchSelectedNode(nodeId, (node) => {
      node.customClasses = [...customClasses];
    });
  }

  function replaceSelectedNode(
    nodeId: string,
    replacement: BuilderNode,
  ): BuilderNode | null {
    const parsedReplacement = BuilderNodeSchema.safeParse(replacement);
    if (!parsedReplacement.success) {
      return null;
    }

    return patchSelectedNode(nodeId, (node) => {
      const target = node as Record<string, unknown>;
      const next = parsedReplacement.data as Record<string, unknown>;

      for (const key of Object.keys(target)) {
        if (!(key in next)) {
          delete target[key];
        }
      }
      Object.assign(target, next);
    });
  }

  function updateSelectedNodeProps(
    nodeId: string,
    props: Partial<BuilderNode["props"]>,
  ): BuilderNode | null {
    return patchSelectedNode(nodeId, (node) => {
      mergeNodeProps(node, props);
    });
  }

  function updateSelectedNodeStyles(
    nodeId: string,
    styles: Partial<BuilderNode["styles"]>,
  ): BuilderNode | null {
    return patchSelectedNode(nodeId, (node) => {
      mergeNodeStyles(node, styles);
    });
  }

  function updateSelectedNodeA11y(
    nodeId: string,
    a11y: Partial<NonNullable<NodeAccessibility>>,
  ): BuilderNode | null {
    return patchSelectedNode(nodeId, (node) => {
      mergeNodeA11y(node, a11y);
    });
  }

  function updateSelectedNodeMotion(
    nodeId: string,
    motion: NodeMotion,
  ): BuilderNode | null {
    return patchSelectedNode(nodeId, (node) => {
      mergeNodeMotion(node, motion);
    });
  }

  function updateSelectedNodeDataSource(
    nodeId: string,
    dataSource: NodeDataSource | null,
  ): BuilderNode | null {
    return patchSelectedNode(nodeId, (node) => {
      mergeNodeDataSource(node, dataSource);
    });
  }

  function updateSelectedNodeMetadata(
    nodeId: string,
    metadata: BuilderNode["metadata"],
  ): BuilderNode | null {
    return patchSelectedNode(nodeId, (node) => {
      mergeNodeMetadata(node, metadata);
    });
  }

  return {
    resolveNode,
    selectedNode: primarySelectedNode,
    selectedNodeId: focusedNodeId,
    primarySelectedNode,
    primarySelectedNodeId,
    selectedNodes,
    selectedNodeIds,
    selectionAnchorNodeId,
    selectionCount,
    isMultiSelect,
    updateSelectedNodeClassNames,
    updateSelectedNodeCustomClasses,
    replaceSelectedNode,
    updateSelectedNodeProps,
    updateSelectedNodeStyles,
    updateSelectedNodeA11y,
    updateSelectedNodeMotion,
    updateSelectedNodeDataSource,
    updateSelectedNodeMetadata,
  };
}
