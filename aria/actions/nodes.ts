/**
 * Actions for manipulating the node tree within pages, layouts,
 * and components. Handles mutations, insertions, deletions, and moves.
 */

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import type { ActionAPIContext } from "astro:actions";
import type { ContentMutationKind } from "../lib/storage/adapter";
import type { OperationId } from "../lib/auth/capabilityOperations";
import type { BuilderNode } from "../lib/types/nodes";
import { NodeMotionSchema } from "../lib/motion/schemas/nodeMotion.schema";
import { UI_PRESETS } from "../lib/motion/presets";
import {
  updateNodeById,
  insertNode,
  insertNodes,
  deleteNodeById,
  deleteNodesById,
  moveNode,
  generateNodeId,
  findNodeById,
} from "../lib/blocks/nodeUtils";
import {
  nodeListContainsNavigation,
  nodeTreeContainsNavigation,
} from "../lib/blocks/navigationPresetClasses";
import {
  NodeClassNamesSchema,
  type NodeClassNames,
} from "../lib/schemas/classEditor";
import {
  getResource,
  getAdapter,
  resolveAuthorizedMutation,
  saveResource,
  type CollectionType,
  type SaveableResource,
} from "./_shared";
import { log as baseLog } from "../lib/utils/logger";
import { normalizeNodeForPersist } from "../lib/blocks/normalizeNodeForPersist";
import { ensureNavigationPresetClassesForAdapter } from "./styles";
import { isTypographyNodeType } from "../lib/blocks/typographyTypes";
import {
  BuilderNodeSchema,
  NodeDataSourceSchema,
  NodeIdSchema as StrictNodeIdSchema,
  NodeMetadataSchema,
} from "../lib/schemas/nodes";

type LogLevel = "debug" | "info" | "warn" | "error";

function collectionMutationKind(
  collection: CollectionType,
): ContentMutationKind {
  switch (collection) {
    case "pages":
      return "save-page";
    case "layouts":
      return "save-layout";
    case "components":
      return "save-component";
  }
}

async function authorizeNodeMutation(
  context: ActionAPIContext,
  operationId: OperationId,
  collection: CollectionType,
) {
  return resolveAuthorizedMutation(
    context,
    operationId,
    collectionMutationKind(collection),
  );
}

interface ActionError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

const ERROR_CODES = {
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  STORAGE_ERROR: "STORAGE_ERROR",
  NODE_NOT_FOUND: "NODE_NOT_FOUND",
  INVALID_MOVE: "INVALID_MOVE",
} as const;

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const prefix = `[Aria Nodes][${level.toUpperCase()}]`;

  baseLog(level, `${prefix} ${message}`, context);
}

const performanceMetrics = new Map<string, { startTime: number }>();

function startPerformanceTracking(operation: string): void {
  performanceMetrics.set(operation, { startTime: performance.now() });
}

function endPerformanceTracking(operation: string): number {
  const metrics = performanceMetrics.get(operation);
  if (!metrics) return 0;

  const duration = Math.round(performance.now() - metrics.startTime);
  performanceMetrics.delete(operation);
  return duration;
}

function createError(
  code: string,
  message: string,
  context?: Record<string, unknown>,
): ActionError {
  return { code, message, context };
}

function handleError(error: unknown, operation: string): never {
  if (error instanceof Error) {
    log("error", `${operation} failed`, { error: error.message });
    throw error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message;
    const genericError = new Error(`${operation} failed: ${message}`);
    log("error", genericError.message, {
      error,
    });
    throw genericError;
  }
  const genericError = new Error(`${operation} failed: ${String(error)}`);
  log("error", genericError.message);
  throw genericError;
}

function sanitizeInput(input: string): string {
  return input
    .replace(/[<>'"&]/g, "")
    .replace(/\.\./g, "")
    .trim();
}

function validateSlug(slug: string): boolean {
  const slugRegex = /^[a-zA-Z0-9_-]+$/;
  return slugRegex.test(slug) && slug.length > 0 && slug.length <= 255;
}

const CollectionSchema = z.enum(["pages", "layouts", "components"]);
const IdSchema = z.string().min(1).max(255);
const NodeIdSchema = z.string();
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

/**
 * Style value with breakpoint support
 */
const ResponsiveStyleValueSchema = z.record(z.string(), z.unknown());
const NodeA11yUpdateSchema = z
  .object({
    role: z.string().optional(),
    ariaLabel: z.string().optional(),
    ariaDescribedBy: z.string().optional(),
    ariaLabelledBy: z.string().optional(),
    ariaHidden: z.boolean().optional(),
    ariaExpanded: z.boolean().optional(),
    ariaControls: z.string().optional(),
    tabIndex: z.number().optional(),
  })
  .strict();

const NodeUpdatesSchema = z.object({
  styles: z.record(z.string(), ResponsiveStyleValueSchema).optional(),
  props: JsonObjectSchema.optional(),
  a11y: NodeA11yUpdateSchema.optional(),
  motion: NodeMotionSchema.optional(),
  dataSource: z.union([NodeDataSourceSchema.unwrap(), z.null()]).optional(),
  metadata: NodeMetadataSchema,
});

function mergeNodeStyleUpdates(
  node: BuilderNode,
  styles: Record<string, Record<string, unknown>>,
): void {
  if (!node.styles) {
    node.styles = {} as BuilderNode["styles"];
  }

  Object.entries(styles).forEach(([prop, bpValues]) => {
    const currentResponsiveValues = (node.styles as Record<string, unknown>)[
      prop
    ];
    const mergedResponsiveValues = {
      ...(currentResponsiveValues && typeof currentResponsiveValues === "object"
        ? (currentResponsiveValues as Record<string, unknown>)
        : {}),
    };

    Object.entries(bpValues).forEach(([breakpoint, value]) => {
      if (value === undefined) {
        delete mergedResponsiveValues[breakpoint];
        return;
      }

      mergedResponsiveValues[breakpoint] = value;
    });

    if (Object.keys(mergedResponsiveValues).length === 0) {
      delete (node.styles as Record<string, unknown>)[prop];
      return;
    }

    (node.styles as Record<string, unknown>)[prop] = mergedResponsiveValues;
  });
}

function mergeNodeA11yUpdates(
  node: BuilderNode,
  a11y: Partial<NonNullable<BuilderNode["a11y"]>>,
): void {
  const nextA11y = {
    ...(node.a11y ?? {}),
  } as NonNullable<BuilderNode["a11y"]>;

  for (const [key, value] of Object.entries(a11y)) {
    if (value === undefined) {
      delete nextA11y[key as keyof NonNullable<BuilderNode["a11y"]>];
      continue;
    }

    nextA11y[key as keyof NonNullable<BuilderNode["a11y"]>] =
      value as NonNullable<BuilderNode["a11y"]>[keyof NonNullable<
        BuilderNode["a11y"]
      >];
  }

  if (Object.keys(nextA11y).length === 0) {
    delete node.a11y;
    return;
  }

  node.a11y = nextA11y;
}

function mergeNodeMotionUpdates(
  node: BuilderNode,
  motion: z.infer<typeof NodeMotionSchema>,
): void {
  const parsed = NodeMotionSchema.safeParse(motion);
  if (!parsed.success) {
    return;
  }

  // Resolve preset: auto-populate effects, trigger, speed, easing,
  // and distance from the preset definition when only a preset ID is
  // provided (agent or API consumers may not send the full config).
  if (parsed.data.preset && parsed.data.effects.length === 0) {
    const presetDef = UI_PRESETS.find((p) => p.id === parsed.data.preset);
    if (presetDef) {
      parsed.data.effects = [...presetDef.effects];
      parsed.data.trigger = presetDef.trigger;
      parsed.data.speed = presetDef.speed;
      parsed.data.easing = presetDef.easing;
      parsed.data.distance = presetDef.distance;
    }
  }

  // If parallax is enabled, entrance motion must also be enabled so the
  // runtime JS is included in published output and the canvas initializes.
  if (parsed.data.parallax?.enabled) {
    parsed.data.enabled = true;
  }

  if (
    !parsed.data.enabled &&
    parsed.data.effects.length === 0 &&
    !parsed.data.parallax?.enabled
  ) {
    delete node.motion;
    return;
  }

  node.motion = parsed.data;
}

function mergeNodePropUpdates(
  node: BuilderNode,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const nextProps = {
    ...(node.props ?? {}),
  } as Record<string, unknown>;

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) {
      delete nextProps[key];
      continue;
    }

    nextProps[key] = value;
  }

  return nextProps;
}

function mergeNodeDataSourceUpdate(
  node: BuilderNode,
  dataSource: z.infer<typeof NodeUpdatesSchema>["dataSource"],
): void {
  if (dataSource === null) {
    delete node.dataSource;
    return;
  }
  if (dataSource === undefined) {
    return;
  }
  node.dataSource = NodeDataSourceSchema.unwrap().parse(dataSource);
}

function mergeNodeMetadataUpdate(
  node: BuilderNode,
  metadata: z.infer<typeof NodeUpdatesSchema>["metadata"],
): void {
  if (metadata === undefined) {
    delete node.metadata;
    return;
  }

  node.metadata = metadata;
}

function applyNodeUpdatesForPersist(
  node: BuilderNode,
  updates: z.infer<typeof NodeUpdatesSchema>,
): BuilderNode {
  if (updates.styles) {
    mergeNodeStyleUpdates(
      node,
      updates.styles as Record<string, Record<string, unknown>>,
    );
  }

  if (updates.props) {
    node.props = mergeNodePropUpdates(
      node,
      updates.props as Record<string, unknown>,
    ) as BuilderNode["props"];
  }

  if (updates.a11y) {
    mergeNodeA11yUpdates(
      node,
      updates.a11y as Partial<NonNullable<BuilderNode["a11y"]>>,
    );
  }

  if (updates.motion) {
    mergeNodeMotionUpdates(node, updates.motion);
  }

  if (updates.dataSource !== undefined) {
    mergeNodeDataSourceUpdate(node, updates.dataSource);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "metadata")) {
    mergeNodeMetadataUpdate(node, updates.metadata);
  }

  const propsUpdate = updates.props;
  const shouldNormalizeIcon =
    propsUpdate !== undefined &&
    "icon" in propsUpdate &&
    propsUpdate.icon !== undefined;
  const shouldNormalizeTypography =
    isTypographyNodeType(node.type) ||
    (propsUpdate !== undefined &&
      ("text" in propsUpdate ||
        "content" in propsUpdate ||
        "level" in propsUpdate ||
        "element" in propsUpdate));

  if (shouldNormalizeTypography || shouldNormalizeIcon) {
    return normalizeNodeForPersist(node);
  }

  return node;
}

const MutateInputSchema = z.object({
  collection: CollectionSchema,
  id: IdSchema,
  nodeId: NodeIdSchema,
  updates: NodeUpdatesSchema,
  breakpoint: z.string(),
  version: z.string().optional(),
});

const MutateBatchInputSchema = z.object({
  collection: CollectionSchema,
  id: IdSchema,
  mutations: z
    .array(
      z.object({
        nodeId: NodeIdSchema,
        updates: NodeUpdatesSchema,
        breakpoint: z.string().optional(),
      }),
    )
    .min(1)
    .max(100),
  version: z.string().optional(),
});

const InsertNodesInputSchema = z.object({
  collection: CollectionSchema,
  id: IdSchema,
  parentId: z.string().nullable(),
  nodes: z.array(BuilderNodeSchema).min(1),
  position: z.number().optional(),
  version: z.string().optional(),
});

const DeleteNodeInputSchema = z.object({
  collection: CollectionSchema,
  id: IdSchema,
  nodeId: NodeIdSchema,
  version: z.string().optional(),
});

const NodeIdsSchema = z
  .array(z.string())
  .min(1, "At least one node ID is required");
const DeleteNodesInputSchema = z.object({
  collection: CollectionSchema,
  id: IdSchema,
  nodeIds: NodeIdsSchema,
  version: z.string().optional(),
});

const MoveNodeInputSchema = z.object({
  collection: CollectionSchema,
  id: IdSchema,
  nodeId: NodeIdSchema,
  targetParentId: z.string().nullable(),
  position: z.number().optional(),
  version: z.string().optional(),
});

export async function handleMutate(
  input: z.infer<typeof MutateInputSchema>,
  context: ActionAPIContext,
): Promise<{ version: string }> {
  const { authorship } = await authorizeNodeMutation(
    context,
    "nodes.mutate",
    input.collection,
  );

  const operation = `mutate:${input.collection}:${input.id}`;
  startPerformanceTracking(operation);

  try {
    const sanitizedId = sanitizeInput(input.id);
    if (!validateSlug(sanitizedId)) {
      throw createError(
        ERROR_CODES.INVALID_INPUT,
        `Invalid ID format: ${input.id}`,
      );
    }

    const adapter = await getAdapter(context);
    const doc = await getResource<SaveableResource>(
      adapter,
      input.collection,
      sanitizedId,
    );

    // Apply updates to the target node
    const updatedNodes = updateNodeById(
      doc.nodes,
      input.nodeId,
      (node: BuilderNode) => {
        return applyNodeUpdatesForPersist(node, input.updates);
      },
    );

    const updatedDoc = {
      ...doc,
      nodes: updatedNodes,
      updatedAt: new Date().toISOString(),
    };

    const version = await saveResource(
      adapter,
      context,
      input.collection,
      sanitizedId,
      updatedDoc,
      authorship,
      { locals: context.locals },
    );

    const duration = endPerformanceTracking(operation);
    log("info", `Mutated node ${input.nodeId}`, {
      version,
      duration: `${duration}ms`,
    });

    return { version };
  } catch (error) {
    endPerformanceTracking(operation);
    return handleError(error, operation);
  }
}

export async function handleMutateBatch(
  input: z.infer<typeof MutateBatchInputSchema>,
  context: ActionAPIContext,
): Promise<{ version: string; mutatedNodeIds: string[] }> {
  const { authorship } = await authorizeNodeMutation(
    context,
    "nodes.mutateBatch",
    input.collection,
  );

  const operation = `mutateBatch:${input.collection}:${input.id}`;
  startPerformanceTracking(operation);

  try {
    const sanitizedId = sanitizeInput(input.id);
    if (!validateSlug(sanitizedId)) {
      throw createError(
        ERROR_CODES.INVALID_INPUT,
        `Invalid ID format: ${input.id}`,
      );
    }

    const adapter = await getAdapter(context);
    const doc = await getResource<SaveableResource>(
      adapter,
      input.collection,
      sanitizedId,
    );

    let updatedNodes = doc.nodes;
    const mutatedNodeIds: string[] = [];

    for (const mutation of input.mutations) {
      updatedNodes = updateNodeById(
        updatedNodes,
        mutation.nodeId,
        (node: BuilderNode) => applyNodeUpdatesForPersist(node, mutation.updates),
      );
      mutatedNodeIds.push(mutation.nodeId);
    }

    const updatedDoc = {
      ...doc,
      nodes: updatedNodes,
      updatedAt: new Date().toISOString(),
    };

    const version = await saveResource(
      adapter,
      context,
      input.collection,
      sanitizedId,
      updatedDoc,
      authorship,
      { locals: context.locals },
    );

    const duration = endPerformanceTracking(operation);
    log("info", `Mutated ${mutatedNodeIds.length} node update(s)`, {
      version,
      duration: `${duration}ms`,
    });

    return { version, mutatedNodeIds };
  } catch (error) {
    endPerformanceTracking(operation);
    return handleError(error, operation);
  }
}

export async function handleInsertNodes(
  input: z.infer<typeof InsertNodesInputSchema>,
  context: ActionAPIContext,
): Promise<{ version: string; nodeIds: string[] }> {
  const { authorship } = await authorizeNodeMutation(
    context,
    "nodes.insertNodes",
    input.collection,
  );

  const operation = `insertNodes:${input.collection}:${input.id}`;
  startPerformanceTracking(operation);

  try {
    const sanitizedId = sanitizeInput(input.id);
    if (!validateSlug(sanitizedId)) {
      throw createError(
        ERROR_CODES.INVALID_INPUT,
        `Invalid ID format: ${input.id}`,
      );
    }

    const adapter = await getAdapter(context);
    const doc = await getResource<SaveableResource>(
      adapter,
      input.collection,
      sanitizedId,
    );

    const normalizedNodes = input.nodes.map((node) =>
      normalizeNodeForPersist({
        ...node,
        id: node.id || generateNodeId(),
      } as BuilderNode),
    );
    if (nodeListContainsNavigation(normalizedNodes)) {
      await ensureNavigationPresetClassesForAdapter(adapter, authorship);
    }

    const updatedNodes = insertNodes(
      doc.nodes,
      input.parentId,
      normalizedNodes,
      input.position,
    );

    const updatedDoc = {
      ...doc,
      nodes: updatedNodes,
      updatedAt: new Date().toISOString(),
    };

    const version = await saveResource(
      adapter,
      context,
      input.collection,
      sanitizedId,
      updatedDoc,
      authorship,
      { locals: context.locals },
    );

    const duration = endPerformanceTracking(operation);
    log("info", `Inserted ${normalizedNodes.length} nodes`, {
      version,
      duration: `${duration}ms`,
    });

    return {
      version,
      nodeIds: normalizedNodes.map((node) => node.id),
    };
  } catch (error) {
    endPerformanceTracking(operation);
    return handleError(error, operation);
  }
}

export async function handleDeleteNode(
  input: z.infer<typeof DeleteNodeInputSchema>,
  context: ActionAPIContext,
): Promise<{ version: string }> {
  const { authorship } = await authorizeNodeMutation(
    context,
    "nodes.deleteNode",
    input.collection,
  );

  const operation = `deleteNode:${input.collection}:${input.id}:${input.nodeId}`;
  startPerformanceTracking(operation);

  try {
    const sanitizedId = sanitizeInput(input.id);
    if (!validateSlug(sanitizedId)) {
      throw createError(
        ERROR_CODES.INVALID_INPUT,
        `Invalid ID format: ${input.id}`,
      );
    }

    const adapter = await getAdapter(context);
    const doc = await getResource<SaveableResource>(
      adapter,
      input.collection,
      sanitizedId,
    );

    // Delete node from tree
    const updatedNodes = deleteNodeById(doc.nodes, input.nodeId);

    const updatedDoc = {
      ...doc,
      nodes: updatedNodes,
      updatedAt: new Date().toISOString(),
    };

    const version = await saveResource(
      adapter,
      context,
      input.collection,
      sanitizedId,
      updatedDoc,
      authorship,
      { locals: context.locals },
    );

    const duration = endPerformanceTracking(operation);
    log("info", `Deleted node ${input.nodeId}`, {
      version,
      duration: `${duration}ms`,
    });

    return { version };
  } catch (error) {
    endPerformanceTracking(operation);
    return handleError(error, operation);
  }
}

export async function handleDeleteNodes(
  input: z.infer<typeof DeleteNodesInputSchema>,
  context: ActionAPIContext,
): Promise<{ version: string }> {
  const { authorship } = await authorizeNodeMutation(
    context,
    "nodes.deleteNode",
    input.collection,
  );

  const operation = `deleteNodes:${input.collection}:${input.id}`;
  startPerformanceTracking(operation);

  try {
    const sanitizedId = sanitizeInput(input.id);
    if (!validateSlug(sanitizedId)) {
      throw createError(
        ERROR_CODES.INVALID_INPUT,
        `Invalid ID format: ${input.id}`,
      );
    }

    const adapter = await getAdapter(context);
    const doc = await getResource<SaveableResource>(
      adapter,
      input.collection,
      sanitizedId,
    );

    // Delete all nodes in a single pass
    const updatedNodes = deleteNodesById(doc.nodes, input.nodeIds);

    const updatedDoc = {
      ...doc,
      nodes: updatedNodes,
      updatedAt: new Date().toISOString(),
    };

    const version = await saveResource(
      adapter,
      context,
      input.collection,
      sanitizedId,
      updatedDoc,
      authorship,
      { locals: context.locals },
    );

    const duration = endPerformanceTracking(operation);
    log("info", `Deleted ${input.nodeIds.length} nodes`, {
      version,
      duration: `${duration}ms`,
    });

    return { version };
  } catch (error) {
    endPerformanceTracking(operation);
    return handleError(error, operation);
  }
}

export async function handleMoveNode(
  input: z.infer<typeof MoveNodeInputSchema>,
  context: ActionAPIContext,
): Promise<{ version: string }> {
  const { authorship } = await authorizeNodeMutation(
    context,
    "nodes.moveNode",
    input.collection,
  );

  const operation = `moveNode:${input.collection}:${input.id}`;
  startPerformanceTracking(operation);

  try {
    const sanitizedId = sanitizeInput(input.id);
    if (!validateSlug(sanitizedId)) {
      throw createError(
        ERROR_CODES.INVALID_INPUT,
        `Invalid ID format: ${input.id}`,
      );
    }

    const adapter = await getAdapter(context);
    const doc = await getResource<SaveableResource>(
      adapter,
      input.collection,
      sanitizedId,
    );

    // Move node (includes validation)
    const updatedNodes = moveNode(
      doc.nodes,
      input.nodeId,
      input.targetParentId,
      input.position,
    );

    const updatedDoc = {
      ...doc,
      nodes: updatedNodes,
      updatedAt: new Date().toISOString(),
    };

    const version = await saveResource(
      adapter,
      context,
      input.collection,
      sanitizedId,
      updatedDoc,
      authorship,
      { locals: context.locals },
    );

    const duration = endPerformanceTracking(operation);
    log("info", `Moved node ${input.nodeId}`, {
      version,
      duration: `${duration}ms`,
    });

    return { version };
  } catch (error) {
    endPerformanceTracking(operation);
    return handleError(error, operation);
  }
}

export const nodes = {
  /**
   * Mutate single node property
   *
   * Updates a specific node's properties or styles in place.
   * Useful for granular edits like changing a single style value.
   */
  mutate: defineAction({
    accept: "json",
    input: MutateInputSchema,
    handler: handleMutate,
  }),

  mutateBatch: defineAction({
    accept: "json",
    input: MutateBatchInputSchema,
    handler: handleMutateBatch,
  }),

  /**
   * Insert node into tree
   *
   * Adds a new node at a specific position in the node tree.
   */
  insertNode: defineAction({
    accept: "json",
    input: z.object({
      collection: CollectionSchema,
      id: IdSchema,
      parentId: z.string().nullable(),
      node: BuilderNodeSchema,
      position: z.number().optional(),
      version: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { authorship } = await authorizeNodeMutation(
        context,
        "nodes.insertNode",
        input.collection,
      );

      const operation = `insertNode:${input.collection}:${input.id}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedId = sanitizeInput(input.id);
        if (!validateSlug(sanitizedId)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid ID format: ${input.id}`,
          );
        }

        const adapter = await getAdapter(context);
        const doc = await getResource<SaveableResource>(
          adapter,
          input.collection,
          sanitizedId,
        );

        // Ensure node has an ID
        const nodeToInsert: BuilderNode = {
          ...input.node,
          id: input.node.id || generateNodeId(),
        } as BuilderNode;

        const normalizedNodeToInsert = normalizeNodeForPersist(nodeToInsert);
        if (nodeTreeContainsNavigation(normalizedNodeToInsert)) {
          await ensureNavigationPresetClassesForAdapter(adapter, authorship);
        }

        // Insert into tree
        const updatedNodes = insertNode(
          doc.nodes,
          input.parentId,
          normalizedNodeToInsert,
          input.position,
        );

        const updatedDoc = {
          ...doc,
          nodes: updatedNodes,
          updatedAt: new Date().toISOString(),
        };

        const version = await saveResource(
          adapter,
          context,
          input.collection,
          sanitizedId,
          updatedDoc,
          authorship,
          { locals: context.locals },
        );

        const duration = endPerformanceTracking(operation);
        log("info", `Inserted node ${normalizedNodeToInsert.id}`, {
          version,
          duration: `${duration}ms`,
        });

        return { version, nodeId: normalizedNodeToInsert.id };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),

  /**
   * Insert multiple sibling nodes into the tree.
   *
   * Saves the updated document once so grouped paste/import flows stay atomic.
   */
  insertNodes: defineAction({
    accept: "json",
    input: InsertNodesInputSchema,
    handler: handleInsertNodes,
  }),

  /**
   * Delete node from tree
   *
   * Removes a node and all its descendants from the tree.
   */
  deleteNode: defineAction({
    accept: "json",
    input: DeleteNodeInputSchema,
    handler: handleDeleteNode,
  }),

  /**
   * Delete multiple nodes from the tree (atomic, single pass).
   *
   * Saves the updated document once so the operation stays atomic.
   */
  deleteNodes: defineAction({
    accept: "json",
    input: DeleteNodesInputSchema,
    handler: handleDeleteNodes,
  }),

  /**
   * Replace an existing node in the tree (same id, new type/props).
   */
  replaceNode: defineAction({
    accept: "json",
    input: z
      .object({
        collection: CollectionSchema,
        id: IdSchema,
        nodeId: StrictNodeIdSchema,
        node: BuilderNodeSchema,
        version: z.string().optional(),
      })
      .strict()
      .refine((value) => value.node.id === value.nodeId, {
        message: "Replacement node id must match nodeId",
        path: ["node", "id"],
      }),
    handler: async (input, context) => {
      const { authorship } = await authorizeNodeMutation(
        context,
        "nodes.replaceNode",
        input.collection,
      );

      const operation = `replaceNode:${input.collection}:${input.id}:${input.nodeId}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedId = sanitizeInput(input.id);
        if (!validateSlug(sanitizedId)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid ID format: ${input.id}`,
          );
        }

        const adapter = await getAdapter(context);
        const doc = await getResource<SaveableResource>(
          adapter,
          input.collection,
          sanitizedId,
        );

        const existingNode = findNodeById(doc.nodes, input.nodeId);
        if (!existingNode) {
          throw createError(
            ERROR_CODES.NODE_NOT_FOUND,
            `Node not found: ${input.nodeId}`,
          );
        }

        const normalizedReplacement = normalizeNodeForPersist(input.node);

        const updatedNodes = updateNodeById(doc.nodes, input.nodeId, () => ({
          type: normalizedReplacement.type,
          props: normalizedReplacement.props,
          styles: normalizedReplacement.styles,
          children: normalizedReplacement.children ?? [],
          slot: normalizedReplacement.slot,
          classNames: normalizedReplacement.classNames,
          customClasses: normalizedReplacement.customClasses,
          componentRef: normalizedReplacement.componentRef,
          hydration: normalizedReplacement.hydration,
          interactions: normalizedReplacement.interactions,
          variants: normalizedReplacement.variants,
          a11y: normalizedReplacement.a11y,
          dataSource: normalizedReplacement.dataSource,
          reference: normalizedReplacement.reference,
          metadata: normalizedReplacement.metadata,
        }));

        const updatedDoc = {
          ...doc,
          nodes: updatedNodes,
          updatedAt: new Date().toISOString(),
        };

        const version = await saveResource(
          adapter,
          context,
          input.collection,
          sanitizedId,
          updatedDoc,
          authorship,
          { locals: context.locals },
        );

        const duration = endPerformanceTracking(operation);
        log("info", `Replaced node ${input.nodeId}`, {
          version,
          duration: `${duration}ms`,
        });

        return { version };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),

  /**
   * Move/reorder node in tree
   *
   * Moves a node to a new parent or position, with validation
   * to prevent invalid moves (e.g., node into itself).
   */
  moveNode: defineAction({
    accept: "json",
    input: MoveNodeInputSchema,
    handler: handleMoveNode,
  }),

  /**
   * Update node's utility classes (classNames per breakpoint)
   *
   * Replaces the entire classNames structure for a node.
   * Use addUtilityClass/removeUtilityClass for single class changes.
   */
  updateClassNames: defineAction({
    accept: "json",
    input: z.object({
      collection: CollectionSchema,
      id: IdSchema,
      nodeId: NodeIdSchema,
      classNames: NodeClassNamesSchema,
      version: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { authorship } = await authorizeNodeMutation(
        context,
        "nodes.updateClassNames",
        input.collection,
      );

      const operation = `updateClassNames:${input.collection}:${input.id}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedId = sanitizeInput(input.id);
        if (!validateSlug(sanitizedId)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid ID format: ${input.id}`,
          );
        }

        const adapter = await getAdapter(context);
        const doc = await getResource<SaveableResource>(
          adapter,
          input.collection,
          sanitizedId,
        );

        const updatedNodes = updateNodeById(
          doc.nodes,
          input.nodeId,
          (node) => ({ ...node, classNames: input.classNames }),
        );

        const updatedDoc = {
          ...doc,
          nodes: updatedNodes,
          updatedAt: new Date().toISOString(),
        };

        const version = await saveResource(
          adapter,
          context,
          input.collection,
          sanitizedId,
          updatedDoc,
          authorship,
          { locals: context.locals },
        );

        const duration = endPerformanceTracking(operation);
        log("info", `Updated classNames for node ${input.nodeId}`, {
          version,
          duration: `${duration}ms`,
        });

        return { version };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),

  /**
   * Add a utility class to a node at a specific key (breakpoint, pseudo, or combo)
   */
  addUtilityClass: defineAction({
    accept: "json",
    input: z.object({
      collection: CollectionSchema,
      id: IdSchema,
      nodeId: NodeIdSchema,
      className: z.string().min(1),
      key: z.string(), // e.g., "base", "md", "hover", "hover:md"
      version: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { authorship } = await authorizeNodeMutation(
        context,
        "nodes.addUtilityClass",
        input.collection,
      );

      const operation = `addUtilityClass:${input.collection}:${input.id}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedId = sanitizeInput(input.id);
        if (!validateSlug(sanitizedId)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid ID format: ${input.id}`,
          );
        }

        const adapter = await getAdapter(context);
        const doc = await getResource<SaveableResource>(
          adapter,
          input.collection,
          sanitizedId,
        );

        // Update node - add class to key
        const updatedNodes = updateNodeById(doc.nodes, input.nodeId, (node) => {
          const classNames: NodeClassNames = node.classNames ?? { base: [] };
          const keyClasses = new Set(classNames[input.key] ?? []);
          keyClasses.add(input.className);

          return {
            ...node,
            classNames: {
              ...classNames,
              [input.key]: Array.from(keyClasses),
            },
          };
        });

        const updatedDoc = {
          ...doc,
          nodes: updatedNodes,
          updatedAt: new Date().toISOString(),
        };

        const version = await saveResource(
          adapter,
          context,
          input.collection,
          sanitizedId,
          updatedDoc,
          authorship,
          { locals: context.locals },
        );

        const duration = endPerformanceTracking(operation);
        log(
          "info",
          `Added class "${input.className}" to node ${input.nodeId} at ${input.key}`,
          {
            version,
            duration: `${duration}ms`,
          },
        );

        return { version };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),

  /**
   * Remove a utility class from a node at a specific key (breakpoint, pseudo, or combo)
   */
  removeUtilityClass: defineAction({
    accept: "json",
    input: z.object({
      collection: CollectionSchema,
      id: IdSchema,
      nodeId: NodeIdSchema,
      className: z.string().min(1),
      key: z.string(), // e.g., "base", "md", "hover", "hover:md"
      version: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { authorship } = await authorizeNodeMutation(
        context,
        "nodes.removeUtilityClass",
        input.collection,
      );

      const operation = `removeUtilityClass:${input.collection}:${input.id}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedId = sanitizeInput(input.id);
        if (!validateSlug(sanitizedId)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid ID format: ${input.id}`,
          );
        }

        const adapter = await getAdapter(context);
        const doc = await getResource<SaveableResource>(
          adapter,
          input.collection,
          sanitizedId,
        );

        // Update node - remove class from key
        const updatedNodes = updateNodeById(doc.nodes, input.nodeId, (node) => {
          const classNames: NodeClassNames = node.classNames ?? { base: [] };
          const keyClasses = (classNames[input.key] ?? []).filter(
            (c) => c !== input.className,
          );

          return {
            ...node,
            classNames: {
              ...classNames,
              [input.key]: keyClasses,
            },
          };
        });

        const updatedDoc = {
          ...doc,
          nodes: updatedNodes,
          updatedAt: new Date().toISOString(),
        };

        const version = await saveResource(
          adapter,
          context,
          input.collection,
          sanitizedId,
          updatedDoc,
          authorship,
          { locals: context.locals },
        );

        const duration = endPerformanceTracking(operation);
        log(
          "info",
          `Removed class "${input.className}" from node ${input.nodeId} at ${input.key}`,
          {
            version,
            duration: `${duration}ms`,
          },
        );

        return { version };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),

  /**
   * Update node's custom class references
   *
   * Replaces the array of custom class names applied to the node.
   */
  updateCustomClasses: defineAction({
    accept: "json",
    input: z.object({
      collection: CollectionSchema,
      id: IdSchema,
      nodeId: NodeIdSchema,
      customClasses: z.array(z.string()),
      version: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { authorship } = await authorizeNodeMutation(
        context,
        "nodes.updateCustomClasses",
        input.collection,
      );

      const operation = `updateCustomClasses:${input.collection}:${input.id}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedId = sanitizeInput(input.id);
        if (!validateSlug(sanitizedId)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid ID format: ${input.id}`,
          );
        }

        const adapter = await getAdapter(context);
        const doc = await getResource<SaveableResource>(
          adapter,
          input.collection,
          sanitizedId,
        );

        const updatedNodes = updateNodeById(
          doc.nodes,
          input.nodeId,
          (node) => ({ ...node, customClasses: input.customClasses }),
        );

        const updatedDoc = {
          ...doc,
          nodes: updatedNodes,
          updatedAt: new Date().toISOString(),
        };

        const version = await saveResource(
          adapter,
          context,
          input.collection,
          sanitizedId,
          updatedDoc,
          authorship,
          { locals: context.locals },
        );

        const duration = endPerformanceTracking(operation);
        log("info", `Updated customClasses for node ${input.nodeId}`, {
          version,
          duration: `${duration}ms`,
        });

        return { version };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),

  /**
   * Add a custom class reference to a node
   */
  addCustomClass: defineAction({
    accept: "json",
    input: z.object({
      collection: CollectionSchema,
      id: IdSchema,
      nodeId: NodeIdSchema,
      className: z.string().min(1),
      version: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { authorship } = await authorizeNodeMutation(
        context,
        "nodes.addCustomClass",
        input.collection,
      );

      const operation = `addCustomClass:${input.collection}:${input.id}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedId = sanitizeInput(input.id);
        if (!validateSlug(sanitizedId)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid ID format: ${input.id}`,
          );
        }

        const adapter = await getAdapter(context);
        const doc = await getResource<SaveableResource>(
          adapter,
          input.collection,
          sanitizedId,
        );

        // Update node - add custom class
        const updatedNodes = updateNodeById(doc.nodes, input.nodeId, (node) => {
          const customClasses = new Set(node.customClasses ?? []);
          customClasses.add(input.className);
          return { ...node, customClasses: Array.from(customClasses) };
        });

        const updatedDoc = {
          ...doc,
          nodes: updatedNodes,
          updatedAt: new Date().toISOString(),
        };

        const version = await saveResource(
          adapter,
          context,
          input.collection,
          sanitizedId,
          updatedDoc,
          authorship,
          { locals: context.locals },
        );

        const duration = endPerformanceTracking(operation);
        log(
          "info",
          `Added custom class "${input.className}" to node ${input.nodeId}`,
          {
            version,
            duration: `${duration}ms`,
          },
        );

        return { version };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),

  /**
   * Remove a custom class reference from a node
   */
  removeCustomClass: defineAction({
    accept: "json",
    input: z.object({
      collection: CollectionSchema,
      id: IdSchema,
      nodeId: NodeIdSchema,
      className: z.string().min(1),
      version: z.string().optional(),
    }),
    handler: async (input, context) => {
      const { authorship } = await authorizeNodeMutation(
        context,
        "nodes.removeCustomClass",
        input.collection,
      );

      const operation = `removeCustomClass:${input.collection}:${input.id}`;
      startPerformanceTracking(operation);

      try {
        const sanitizedId = sanitizeInput(input.id);
        if (!validateSlug(sanitizedId)) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            `Invalid ID format: ${input.id}`,
          );
        }

        const adapter = await getAdapter(context);
        const doc = await getResource<SaveableResource>(
          adapter,
          input.collection,
          sanitizedId,
        );

        // Update node - remove custom class
        const updatedNodes = updateNodeById(
          doc.nodes,
          input.nodeId,
          (node) => ({
            ...node,
            customClasses: (node.customClasses ?? []).filter(
              (c) => c !== input.className,
            ),
          }),
        );

        const updatedDoc = {
          ...doc,
          nodes: updatedNodes,
          updatedAt: new Date().toISOString(),
        };

        const version = await saveResource(
          adapter,
          context,
          input.collection,
          sanitizedId,
          updatedDoc,
          authorship,
          { locals: context.locals },
        );

        const duration = endPerformanceTracking(operation);
        log(
          "info",
          `Removed custom class "${input.className}" from node ${input.nodeId}`,
          {
            version,
            duration: `${duration}ms`,
          },
        );

        return { version };
      } catch (error) {
        endPerformanceTracking(operation);
        return handleError(error, operation);
      }
    },
  }),
};
