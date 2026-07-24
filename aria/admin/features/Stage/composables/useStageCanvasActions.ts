import { z } from "zod";
import type { ReorderOperation } from "../../../types/app";
import { log } from "@/lib/utils/logger";

const StageCanvasNodeIdSchema = z.string().trim().min(1);
const StageCanvasSlotNameSchema = z.string().trim().min(1);
const StageCanvasComponentSlugSchema = z.string().trim().min(1);

export interface UseStageCanvasActionsDeps {
  openPicker: (slotName: string) => void;
  handleReorderBlock: (operation: ReorderOperation) => void;
  deleteBlock: (nodeId: string) => void;
  duplicateBlock: (nodeId: string) => void;
  detachComponent: (nodeId: string) => Promise<void> | void;
  replaceBlockWithComponent: (
    nodeId: string,
    componentSlug: string,
  ) => Promise<void> | void;
}

export interface UseStageCanvasActionsReturn {
  handleDeleteBlock: (nodeId: string) => void;
  handleDuplicateBlock: (nodeId: string) => void;
  handleDetachComponent: (nodeId: string) => Promise<void> | void;
  handleReplaceBlockWithComponent: (
    nodeId: string,
    componentSlug: string,
  ) => Promise<void> | void;
  handleReorderBlock: (operation: ReorderOperation) => void;
  handleCanvasOpenPicker: (slotName: string) => void;
}

export function useStageCanvasActions(
  deps: UseStageCanvasActionsDeps,
): UseStageCanvasActionsReturn {
  const {
    openPicker,
    handleReorderBlock,
    deleteBlock,
    duplicateBlock,
    detachComponent,
    replaceBlockWithComponent,
  } = deps;

  const validateNodeId = (nodeId: string, action: string): string | null => {
    const parsedNodeId = StageCanvasNodeIdSchema.safeParse(nodeId);
    if (!parsedNodeId.success) {
      log(
        "warn",
        `[useStageCanvasActions] Ignoring invalid ${action} node id`,
        {
          nodeId,
        },
      );
      return null;
    }

    return parsedNodeId.data;
  };

  const handleDeleteBlock = (nodeId: string): void => {
    const parsedNodeId = validateNodeId(nodeId, "delete");
    if (!parsedNodeId) {
      return;
    }

    deleteBlock(parsedNodeId);
  };

  const handleDuplicateBlock = (nodeId: string): void => {
    const parsedNodeId = validateNodeId(nodeId, "duplicate");
    if (!parsedNodeId) {
      return;
    }

    duplicateBlock(parsedNodeId);
  };

  const handleDetachComponent = async (nodeId: string): Promise<void> => {
    const parsedNodeId = validateNodeId(nodeId, "detach");
    if (!parsedNodeId) {
      return;
    }

    await detachComponent(parsedNodeId);
  };

  const handleReplaceBlockWithComponent = async (
    nodeId: string,
    componentSlug: string,
  ): Promise<void> => {
    const parsedNodeId = validateNodeId(nodeId, "replace");
    if (!parsedNodeId) {
      return;
    }

    const parsedComponentSlug =
      StageCanvasComponentSlugSchema.safeParse(componentSlug);
    if (!parsedComponentSlug.success) {
      log(
        "warn",
        "[useStageCanvasActions] Ignoring invalid replacement component slug",
        {
          nodeId,
          componentSlug,
        },
      );
      return;
    }

    await replaceBlockWithComponent(parsedNodeId, parsedComponentSlug.data);
  };

  const handleCanvasOpenPicker = (slotName: string): void => {
    const parsedSlotName = StageCanvasSlotNameSchema.safeParse(slotName);
    if (!parsedSlotName.success) {
      log("warn", "[useStageCanvasActions] Ignoring invalid picker slot", {
        slotName,
      });
      return;
    }

    openPicker(parsedSlotName.data);
  };

  return {
    handleDeleteBlock,
    handleDuplicateBlock,
    handleDetachComponent,
    handleReplaceBlockWithComponent,
    handleReorderBlock,
    handleCanvasOpenPicker,
  };
}
