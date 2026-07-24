import { z } from "zod";

import { useHistory } from "../../../History";
import type { OperationType } from "../../../History";

const NodeEventHistoryTypeSchema = z.enum([
  "update-node",
  "insert-node",
  "delete-node",
  "move-node",
  "reorder-nodes",
]);

const NodeEventHistoryMetadataSchema = z
  .object({
    type: NodeEventHistoryTypeSchema,
    description: z.string().trim().min(1),
    affectedNodeIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export type NodeEventHistoryResult = {
  success: boolean;
  error?: string;
};

export interface NodeEventHistoryCallbacks {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

interface NodeEventHistoryDependencies {
  execute: ReturnType<typeof useHistory>["execute"];
}

export type ExecuteNodeEventOperation = (
  metadata: z.input<typeof NodeEventHistoryMetadataSchema>,
  callbacks: NodeEventHistoryCallbacks,
) => Promise<NodeEventHistoryResult>;

export function useNodeEventHistory(
  dependencies?: NodeEventHistoryDependencies,
) {
  const { execute } = dependencies ?? useHistory();

  const executeNodeEventOperation: ExecuteNodeEventOperation = async (
    metadata: z.input<typeof NodeEventHistoryMetadataSchema>,
    callbacks: NodeEventHistoryCallbacks,
  ): Promise<NodeEventHistoryResult> => {
    const parsedMetadata = NodeEventHistoryMetadataSchema.safeParse(metadata);
    if (!parsedMetadata.success) {
      return {
        success: false,
        error:
          parsedMetadata.error.issues[0]?.message ??
          "Invalid node history metadata",
      };
    }

    const result = await execute({
      type: parsedMetadata.data.type as OperationType,
      timestamp: Date.now(),
      description: parsedMetadata.data.description,
      affectedNodeIds: parsedMetadata.data.affectedNodeIds,
      undo: callbacks.undo,
      redo: callbacks.redo,
    });

    if (!result.success) {
      return {
        success: false,
        error:
          result.error?.message ??
          `Failed to execute node history operation: ${parsedMetadata.data.type}`,
      };
    }

    return { success: true };
  };

  return {
    executeNodeEventOperation,
  };
}
