import { type Ref } from "vue";
import { toast } from "vue-sonner";
import { z } from "zod";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { BuilderNodeSchema } from "../../../../lib/schemas/nodes";
import { JsonValueSchema } from "../../../../lib/schemas/json";
import type { ReorderOperation, ReorderNodePayload } from "../../../types/app";
import type { LayersReorderData } from "../../../types/app";
import type { useHistory } from "../../History";
import { cloneDeep } from "../utils";
import type { useNodeManipulation } from "../../Nodes/mutations/useNodeManipulation";
import { log } from "@/lib/utils/logger";
import { useEditorMutationHistory } from "./useEditorMutationHistory";

export interface EditorMutationHandlersDeps {
  pageBlocks: Ref<BuilderNode[]>;
  hasUnsavedChanges: Ref<boolean>;
  history: ReturnType<typeof useHistory>;
  nodeManipulation: ReturnType<typeof useNodeManipulation>;
  nodeEventHandlers: {
    handleLayersReorderNode: (payload: {
      nodeId: string;
      targetNodeId: string;
      position: LayersReorderData["position"];
    }) => void;
  };
  focusNode: (id: string | null) => void;
}

export interface EditorMutationHandlersReturn {
  handleAddBlock: (newBlock: BuilderNode, parentId: string | null) => void;
  handleReorderBlock: (operation: ReorderOperation) => void;
  handleReorderNode: (payload: ReorderNodePayload) => void;
  handleNodePropUpdate: (
    nodeId: string,
    propName: string,
    value: unknown,
    description?: string,
  ) => void;
}

const ReorderOperationSchema = z.object({
  sourceParentId: z.string().nullable(),
  sourceIndex: z.int().min(0),
  targetParentId: z.string().nullable(),
  targetIndex: z.int().min(0),
});

const AddBlockInputSchema = z
  .object({
    newBlock: BuilderNodeSchema,
    parentId: z.string().trim().min(1).nullable(),
  })
  .strict();

const NodePropUpdateInputSchema = z
  .object({
    nodeId: z.string().trim().min(1),
    propName: z.string().trim().min(1),
    value: JsonValueSchema.optional(),
    description: z.string().trim().min(1).optional(),
  })
  .strict();

function findParentArray(
  nodes: BuilderNode[],
  parentId: string | null,
): BuilderNode[] | null {
  if (parentId === null) {
    return nodes;
  }

  const stack: BuilderNode[] = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (node.id === parentId) {
      if (!node.children) {
        node.children = [];
      }
      return node.children;
    }

    if (node.children?.length) {
      stack.push(...node.children);
    }
  }

  return null;
}

function applyReorderOperation(
  blocks: BuilderNode[],
  operation: ReorderOperation,
): boolean {
  const sourceArray = findParentArray(blocks, operation.sourceParentId);
  const targetArray = findParentArray(blocks, operation.targetParentId);

  if (!sourceArray || !targetArray) {
    return false;
  }

  if (operation.sourceIndex >= sourceArray.length) {
    return false;
  }

  const [movedNode] = sourceArray.splice(operation.sourceIndex, 1);
  if (!movedNode) {
    return false;
  }

  let adjustedTargetIndex = operation.targetIndex;
  if (
    sourceArray === targetArray &&
    operation.sourceIndex < operation.targetIndex
  ) {
    adjustedTargetIndex = operation.targetIndex - 1;
  }

  const clampedTargetIndex = Math.max(
    0,
    Math.min(adjustedTargetIndex, targetArray.length),
  );

  targetArray.splice(clampedTargetIndex, 0, movedNode);
  return true;
}

export function useEditorMutationHandlers(
  deps: EditorMutationHandlersDeps,
): EditorMutationHandlersReturn {
  const {
    pageBlocks,
    hasUnsavedChanges,
    history,
    nodeManipulation,
    nodeEventHandlers,
    focusNode,
  } = deps;
  const { executeEditorMutation } = useEditorMutationHistory(history);

  const handleAddBlock = (
    newBlock: BuilderNode,
    parentId: string | null,
  ): void => {
    const parsedInput = AddBlockInputSchema.safeParse({ newBlock, parentId });
    if (!parsedInput.success) {
      log("warn", "[EditorMutation] Invalid add-block payload", {
        issues: parsedInput.error.issues,
      });
      toast.error("Could not insert block");
      return;
    }

    const validatedBlock = parsedInput.data.newBlock;
    const validatedParentId = parsedInput.data.parentId;

    if (!validatedParentId) {
      const insertIndex = pageBlocks.value.length;

      const executed = executeEditorMutation(
        {
          type: "insert-node",
          description: `Add ${validatedBlock.type} block`,
          affectedNodeIds: [validatedBlock.id],
        },
        {
          undo: () => {
            pageBlocks.value.splice(insertIndex, 1);
            focusNode(null);
          },
          redo: () => {
            pageBlocks.value.splice(insertIndex, 0, validatedBlock);
            focusNode(validatedBlock.id);
          },
        },
      );

      if (!executed) {
        toast.error("Could not insert block");
        return;
      }

      hasUnsavedChanges.value = true;
      toast.success(`Added ${validatedBlock.type} block`);
      return;
    }

    const parent = nodeManipulation.findNodeById(
      pageBlocks.value,
      validatedParentId,
    );
    if (!parent) {
      toast.error("Could not insert block: parent not found");
      return;
    }

    if (!parent.children) {
      parent.children = [];
    }

    const insertIndex = parent.children.length;

    const executed = executeEditorMutation(
      {
        type: "insert-node",
        description: `Add ${validatedBlock.type} block`,
        affectedNodeIds: [validatedBlock.id],
      },
      {
        undo: () => {
          parent.children?.splice(insertIndex, 1);
          focusNode(null);
        },
        redo: () => {
          if (!parent.children) parent.children = [];
          parent.children.splice(insertIndex, 0, validatedBlock);
          focusNode(validatedBlock.id);
        },
      },
    );

    if (!executed) {
      toast.error("Could not insert block");
      return;
    }

    hasUnsavedChanges.value = true;
    toast.success(`Added ${validatedBlock.type} block`);
  };

  const handleReorderBlock = (operation: ReorderOperation): void => {
    const validation = ReorderOperationSchema.safeParse(operation);
    if (!validation.success) {
      toast.error("Invalid reorder payload");
      return;
    }

    const validatedOperation = validation.data;
    const beforeBlocks = cloneDeep(pageBlocks.value);
    const nextBlocks = cloneDeep(pageBlocks.value);

    const didReorder = applyReorderOperation(nextBlocks, validatedOperation);
    if (!didReorder) {
      toast.error("Unable to reorder block");
      return;
    }

    const executed = executeEditorMutation(
      {
        type: "reorder-nodes",
        description: "Reorder canvas block",
        group: {
          key: `stage-reorder:${validatedOperation.sourceParentId ?? "root"}->${validatedOperation.targetParentId ?? "root"}`,
          windowMs: 900,
        },
      },
      {
        undo: () => {
          pageBlocks.value = cloneDeep(beforeBlocks);
        },
        redo: () => {
          pageBlocks.value = cloneDeep(nextBlocks);
        },
      },
    );

    if (!executed) {
      toast.error("Unable to reorder block");
      return;
    }

    hasUnsavedChanges.value = true;
  };

  const handleReorderNode = (payload: ReorderNodePayload): void => {
    if (!payload.targetNodeId) {
      return;
    }

    const nextPosition: LayersReorderData["position"] =
      payload.position === 0 ? "before" : "after";

    nodeEventHandlers.handleLayersReorderNode({
      nodeId: payload.nodeId,
      targetNodeId: payload.targetNodeId,
      position: nextPosition,
    });
  };

  const handleNodePropUpdate = (
    nodeId: string,
    propName: string,
    value: unknown,
    description?: string,
  ): void => {
    const parsedInput = NodePropUpdateInputSchema.safeParse({
      nodeId,
      propName,
      value,
      description,
    });
    if (!parsedInput.success) {
      log("warn", "[EditorMutation] Invalid node-prop update payload", {
        issues: parsedInput.error.issues,
      });
      return;
    }

    const result = nodeManipulation.findNodeToDelete(
      pageBlocks.value,
      parsedInput.data.nodeId,
    );
    if (!result) return;

    const { node } = result;
    const oldValue = node.props?.[parsedInput.data.propName];
    const nextValue = parsedInput.data.value;

    const executed = executeEditorMutation(
      {
        type: "update-node-props",
        description:
          parsedInput.data.description || `Update ${parsedInput.data.propName}`,
        affectedNodeIds: [parsedInput.data.nodeId],
      },
      {
        undo: () => {
          if (!node.props) node.props = {};
          node.props[parsedInput.data.propName] = oldValue;
        },
        redo: () => {
          if (!node.props) node.props = {};
          node.props[parsedInput.data.propName] = nextValue;
        },
      },
    );

    if (!executed) {
      return;
    }

    hasUnsavedChanges.value = true;
  };

  return {
    handleAddBlock,
    handleReorderBlock,
    handleReorderNode,
    handleNodePropUpdate,
  };
}
