import type { Ref } from "vue";
import { z } from "zod";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { useBeacon } from "../../Beacon";
import { useCanvasInteractionBridge } from "../../Core";
import {
  StageSelectBlockInputSchema,
  type StageSelectBlockInput,
} from "../types";
import { log } from "@/lib/utils/logger";

const StageRegionIdSchema = z.enum(["header", "footer"]);
const StageBlockIdSchema = z.string().trim().min(1);

export interface UseStageSelectionOptions {
  pageBlocks: Ref<BuilderNode[]>;
  selectedLayoutRegion: Ref<string | null>;
  openLayersEditorTab: () => void;
  handleAddBlock: (block: BuilderNode, parentId: string | null) => void;
}

export interface UseStageSelectionReturn {
  handleClearSelection: () => void;
  handleBackgroundClick: () => void;
  handleStageSelectBlock: (selection: StageSelectBlockInput) => void;
  handleStageAddBlock: (block: BuilderNode, parentId: string | null) => void;
  handleEditLayoutRegion: (regionId: string) => void;
}

export function useStageSelection(
  options: UseStageSelectionOptions,
): UseStageSelectionReturn {
  const { broadcastSelectNode, signalClearInsertionContext } =
    useCanvasInteractionBridge();
  const { illuminateById, clearSelection } = useBeacon();
  const {
    pageBlocks,
    selectedLayoutRegion,
    openLayersEditorTab,
    handleAddBlock,
  } = options;

  const handleClearSelection = (): void => {
    clearSelection();
    broadcastSelectNode({ nodeId: null });
    signalClearInsertionContext();
  };

  const handleBackgroundClick = (): void => {
    handleClearSelection();
  };

  const handleStageSelectBlock = (selection: StageSelectBlockInput): void => {
    const parsedSelection = StageSelectBlockInputSchema.safeParse(selection);
    if (!parsedSelection.success) {
      log("warn", "[useStageSelection] Ignoring invalid stage selection", {
        selection,
      });
      return;
    }

    if (
      parsedSelection.data !== null &&
      typeof parsedSelection.data === "object"
    ) {
      const nodeId = parsedSelection.data.nodeId;
      if (!nodeId) {
        clearSelection();
        return;
      }

      // Canvas selection is already synchronized via onSelectNode signals.
      // Avoid handling selection here as well to prevent additive toggles
      // from being applied twice (flash + deselect).
      openLayersEditorTab();
      return;
    }

    const id = parsedSelection.data;
    if (id) {
      const parsedBlockId = StageBlockIdSchema.safeParse(id);
      if (!parsedBlockId.success) {
        log("warn", "[useStageSelection] Ignoring invalid block selection", {
          id,
        });
        return;
      }

      illuminateById(parsedBlockId.data, pageBlocks.value);
      openLayersEditorTab();
    } else {
      clearSelection();
    }
  };

  const handleStageAddBlock = (
    block: BuilderNode,
    parentId: string | null,
  ): void => {
    handleAddBlock(block, parentId);
  };

  const handleEditLayoutRegion = (regionId: string): void => {
    const parsedRegionId = StageRegionIdSchema.safeParse(regionId);
    if (!parsedRegionId.success) {
      log("warn", "[useStageSelection] Ignoring invalid layout region", {
        regionId,
      });
      return;
    }

    selectedLayoutRegion.value = parsedRegionId.data;
    clearSelection();
  };

  return {
    handleClearSelection,
    handleBackgroundClick,
    handleStageSelectBlock,
    handleStageAddBlock,
    handleEditLayoutRegion,
  };
}
