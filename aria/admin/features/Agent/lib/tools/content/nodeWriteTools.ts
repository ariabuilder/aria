import {
  handleInsertNodes,
  handleMutate,
  handleMoveNode,
  handleDeleteNode,
} from "../../../../../../actions/nodes";
import { nodes } from "../../../../../../actions/nodes";
import { hasEffectiveCapability } from "../../../../../../lib/auth";
import {
  formatAgentNodeNormalizationIssues,
  normalizeAgentNodeTreeForInsert,
} from "../../../../../../lib/blocks/agentNodeNormalizer";
import { regenerateNodeTreeIds } from "../../../../../../lib/ids/nodeId";
import { BuilderNodeSchema } from "../../../../../../lib/schemas/nodes";
import type { BuilderNode } from "../../../../../../lib/types/nodes";
import {
  preflightBuilderNodeArrayInput,
  preflightBuilderNodeInput,
} from "../../../../../../lib/rendering/canonical/preflight";
import { renderSurfaceKindForCollection } from "../../../../../../lib/rendering/canonical";
import {
  AriaInsertNodesInputSchema,
  AriaInsertNodesOutputSchema,
  AriaMutateNodeInputSchema,
  AriaUpdateNodeMotionInputSchema,
  AriaUpdateNodeClassesInputSchema,
  AriaReplaceNodeInputSchema,
  AriaMoveNodeInputSchema,
  AriaDeleteNodeInputSchema,
  WriteSuccessSchema,
  type AgentToolResult,
} from "../../schemas";
import { invokeActionHandlerForTool } from "../invokeActionHandlerForTool";
import { callDefinedAction } from "../callDefinedAction";
import type { ActionAPIContext } from "astro:actions";
import { toolErrorFromZod, toolErrorResult } from "../toolErrors";
import type { AgentToolActionContext } from "../types";
import { toToolActionContext } from "../toolActionContext";
import { denyUtilityClassesWhenDisabled } from "./utilityClassPolicy";

function writeSuccessResult(): { success: true } {
  return { success: true as const };
}

function denyPageWrites(
  context: AgentToolActionContext,
): AgentToolResult<never> | null {
  if (context.user && !hasEffectiveCapability(context.user, "editPages")) {
    return toolErrorResult({
      code: "FORBIDDEN",
      message: "Your role cannot modify page content.",
      suggestedFix: "Ask an administrator with page edit access.",
    });
  }
  return null;
}

/**
 * Insert nodes into a document tree (server-side, no open composer needed).
 * Maps to nodes.insertNodes for the actual tree mutation + crud.updateItem
 * to persist the updated document.
 */
export async function ariaInsertNodes(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ nodeIds: string[]; version: string }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaInsertNodesInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  let preflightedNodes: unknown[];
  try {
    preflightedNodes = preflightBuilderNodeArrayInput({
      kind: renderSurfaceKindForCollection(parsed.data.collection),
      nodes: parsed.data.nodes,
    }).source as unknown[];
  } catch {
    return toolErrorResult({
      code: "RENDER_INPUT_INVALID",
      message: "The render input is invalid.",
    });
  }

  const normalized = normalizeAgentNodeTreeForInsert(preflightedNodes);
  if (!normalized.ok) {
    return toolErrorResult({
      code: "INVALID_INPUT",
      message: "Invalid node",
      suggestedFix: formatAgentNodeNormalizationIssues(normalized.issues),
    });
  }

  const utilityClassesDenied = await denyUtilityClassesWhenDisabled(
    context,
    normalized.nodes,
  );
  if (utilityClassesDenied) return utilityClassesDenied;

  // Regenerate all IDs recursively so agent-generated IDs never collide with
  // existing tree IDs or across multiple insert calls.
  const validatedNodes: BuilderNode[] = normalized.nodes.map((node) =>
    regenerateNodeTreeIds(node),
  );

  return invokeActionHandlerForTool({
    context,
    operationId: "nodes.insertNodes",
    inputSchema: AriaInsertNodesInputSchema,
    outputSchema: AriaInsertNodesOutputSchema,
    payload: { ...parsed.data, nodes: validatedNodes },
    handler: async () =>
      handleInsertNodes(
        {
          collection: parsed.data.collection,
          id: parsed.data.slug,
          parentId: parsed.data.parentId ?? null,
          nodes: validatedNodes,
          position: parsed.data.position,
        },
        actionContext,
      ),
  });
}

/**
 * Mutate a single node's props, styles, or motion.
 */
export async function ariaMutateNode(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaMutateNodeInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const utilityClassesDenied = await denyUtilityClassesWhenDisabled(
    context,
    parsed.data.updates,
  );
  if (utilityClassesDenied) return utilityClassesDenied;

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "nodes.mutate",
    inputSchema: AriaMutateNodeInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () => {
      await handleMutate(
        {
          collection: parsed.data.collection,
          id: parsed.data.slug,
          nodeId: parsed.data.nodeId,
          updates: (parsed.data.updates ?? {}) as Record<string, unknown>,
          breakpoint: parsed.data.breakpoint ?? "base",
        },
        actionContext,
      );
      return writeSuccessResult();
    },
  });
}

/**
 * Apply Aria Motion to a single node. This is intentionally explicit for MCP
 * and other server-side agents that cannot rely on Composer selection state.
 */
export async function ariaUpdateNodeMotion(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaUpdateNodeMotionInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "nodes.updateNodeMotion",
    inputSchema: AriaUpdateNodeMotionInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () => {
      await handleMutate(
        {
          collection: parsed.data.collection,
          id: parsed.data.slug,
          nodeId: parsed.data.nodeId,
          updates: { motion: parsed.data.motion },
          breakpoint: "base",
        },
        actionContext,
      );
      return writeSuccessResult();
    },
  });
}

/**
 * Move a node to a new parent in the tree.
 */
export async function ariaMoveNode(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaMoveNodeInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "nodes.moveNode",
    inputSchema: AriaMoveNodeInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () => {
      await handleMoveNode(
        {
          collection: parsed.data.collection,
          id: parsed.data.slug,
          nodeId: parsed.data.nodeId,
          targetParentId: parsed.data.newParentId,
          position: parsed.data.index,
        },
        actionContext,
      );
      return writeSuccessResult();
    },
  });
}

/**
 * Delete a node from the document tree.
 */
export async function ariaDeleteNode(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaDeleteNodeInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "nodes.deleteNode",
    inputSchema: AriaDeleteNodeInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () => {
      await handleDeleteNode(
        {
          collection: parsed.data.collection,
          id: parsed.data.slug,
          nodeId: parsed.data.nodeId,
        },
        actionContext,
      );
      return writeSuccessResult();
    },
  });
}

function actionHandler(action: unknown) {
  return (payload: unknown, context: unknown) =>
    callDefinedAction(action, context as ActionAPIContext, payload);
}

export async function ariaUpdateNodeClasses(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaUpdateNodeClassesInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  if (
    parsed.data.classNames !== undefined ||
    parsed.data.addUtilityClass !== undefined ||
    parsed.data.removeUtilityClass !== undefined
  ) {
    const utilityClassesDenied = await denyUtilityClassesWhenDisabled(context, {
      classNames:
        parsed.data.classNames ??
        parsed.data.addUtilityClass ??
        parsed.data.removeUtilityClass,
    });
    if (utilityClassesDenied) return utilityClassesDenied;
  }

  const actionContext = toToolActionContext(context);
  const base = {
    collection: parsed.data.collection,
    id: parsed.data.slug,
    nodeId: parsed.data.nodeId,
  };

  if (parsed.data.classNames) {
    return invokeActionHandlerForTool({
      context,
      operationId: "nodes.updateClassNames",
      inputSchema: AriaUpdateNodeClassesInputSchema,
      outputSchema: WriteSuccessSchema,
      payload: parsed.data,
      handler: async () => {
        await actionHandler(nodes.updateClassNames)(
          {
            ...base,
            classNames: parsed.data.classNames,
          },
          actionContext,
        );
        return writeSuccessResult();
      },
    });
  }

  if (parsed.data.addUtilityClass) {
    const addUtilityClass = parsed.data.addUtilityClass;
    return invokeActionHandlerForTool({
      context,
      operationId: "nodes.addUtilityClass",
      inputSchema: AriaUpdateNodeClassesInputSchema,
      outputSchema: WriteSuccessSchema,
      payload: parsed.data,
      handler: async () => {
        await actionHandler(nodes.addUtilityClass)(
          {
            ...base,
            key: addUtilityClass.breakpoint,
            className: addUtilityClass.className,
          },
          actionContext,
        );
        return writeSuccessResult();
      },
    });
  }

  if (parsed.data.removeUtilityClass) {
    const removeUtilityClass = parsed.data.removeUtilityClass;
    return invokeActionHandlerForTool({
      context,
      operationId: "nodes.removeUtilityClass",
      inputSchema: AriaUpdateNodeClassesInputSchema,
      outputSchema: WriteSuccessSchema,
      payload: parsed.data,
      handler: async () => {
        await actionHandler(nodes.removeUtilityClass)(
          {
            ...base,
            key: removeUtilityClass.breakpoint,
            className: removeUtilityClass.className,
          },
          actionContext,
        );
        return writeSuccessResult();
      },
    });
  }

  if (parsed.data.customClasses) {
    return invokeActionHandlerForTool({
      context,
      operationId: "nodes.updateCustomClasses",
      inputSchema: AriaUpdateNodeClassesInputSchema,
      outputSchema: WriteSuccessSchema,
      payload: parsed.data,
      handler: async () => {
        await actionHandler(nodes.updateCustomClasses)(
          {
            ...base,
            customClasses: parsed.data.customClasses,
          },
          actionContext,
        );
        return writeSuccessResult();
      },
    });
  }

  return toolErrorResult({
    code: "INVALID_INPUT",
    message:
      "Provide classNames, addUtilityClass, removeUtilityClass, or customClasses.",
  });
}

export async function ariaReplaceNode(
  context: AgentToolActionContext,
  input: unknown,
): Promise<AgentToolResult<{ success: true }>> {
  const denied = denyPageWrites(context);
  if (denied) return denied;

  const parsed = AriaReplaceNodeInputSchema.safeParse(input);
  if (!parsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid tool input", parsed.error.issues),
    );
  }

  let preflightedNode: unknown;
  try {
    preflightedNode = preflightBuilderNodeInput({
      kind: renderSurfaceKindForCollection(parsed.data.collection),
      node: parsed.data.node,
    }).source;
  } catch {
    return toolErrorResult({
      code: "RENDER_INPUT_INVALID",
      message: "The render input is invalid.",
    });
  }

  const nodeParsed = BuilderNodeSchema.safeParse(preflightedNode);
  if (!nodeParsed.success) {
    return toolErrorResult(
      toolErrorFromZod("Invalid replacement node", nodeParsed.error.issues),
    );
  }

  const replacement = {
    ...nodeParsed.data,
    id: parsed.data.nodeId,
  };

  const utilityClassesDenied = await denyUtilityClassesWhenDisabled(
    context,
    replacement,
  );
  if (utilityClassesDenied) return utilityClassesDenied;

  const actionContext = toToolActionContext(context);

  return invokeActionHandlerForTool({
    context,
    operationId: "nodes.replaceNode",
    inputSchema: AriaReplaceNodeInputSchema,
    outputSchema: WriteSuccessSchema,
    payload: parsed.data,
    handler: async () => {
      await actionHandler(nodes.replaceNode)(
        {
          collection: parsed.data.collection,
          id: parsed.data.slug,
          nodeId: parsed.data.nodeId,
          node: replacement,
        },
        actionContext,
      );
      return writeSuccessResult();
    },
  });
}
