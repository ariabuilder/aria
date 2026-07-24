import { z } from "zod";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { BuilderNodeSchema } from "../../../../lib/schemas/nodes";
import type { ReorderOperation } from "../../../types/app";
import { log } from "@/lib/utils/logger";

const StageParentIdSchema = z.string().trim().min(1).nullable();
const StageReorderOperationSchema = z.object({
  sourceParentId: StageParentIdSchema,
  sourceIndex: z.int().min(0),
  targetParentId: StageParentIdSchema,
  targetIndex: z.int().min(0),
});

export interface UseStageMutationActionsDeps {
  handleAddBlock: (block: BuilderNode, parentId: string | null) => void;
  handleReorderBlock: (operation: ReorderOperation) => void;
}

export interface UseStageMutationActionsReturn {
  handleStageAddBlock: (block: BuilderNode, parentId: string | null) => void;
  handleStageReorderBlock: (operation: ReorderOperation) => void;
}

export function useStageMutationActions(
  deps: UseStageMutationActionsDeps,
): UseStageMutationActionsReturn {
  const { handleAddBlock, handleReorderBlock } = deps;

  const handleStageAddBlock = (
    block: BuilderNode,
    parentId: string | null,
  ): void => {
    const parsedBlock = BuilderNodeSchema.safeParse(block);
    const parsedParentId = StageParentIdSchema.safeParse(parentId);
    if (!parsedBlock.success || !parsedParentId.success) {
      log(
        "warn",
        "[useStageMutationActions] Ignoring invalid add-block request",
        {
          blockId: block?.id,
          parentId,
        },
      );
      return;
    }

    handleAddBlock(parsedBlock.data, parsedParentId.data);
  };

  const handleStageReorderBlock = (operation: ReorderOperation): void => {
    const parsedOperation = StageReorderOperationSchema.safeParse(operation);
    if (!parsedOperation.success) {
      log(
        "warn",
        "[useStageMutationActions] Ignoring invalid reorder operation",
        {
          issues: parsedOperation.error.issues,
        },
      );
      return;
    }

    handleReorderBlock(parsedOperation.data);
  };

  return {
    handleStageAddBlock,
    handleStageReorderBlock,
  };
}
