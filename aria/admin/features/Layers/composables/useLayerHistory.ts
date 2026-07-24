import { computed, type Ref } from "vue";
import { z } from "zod";
import { cloneDeep } from "../../Core";
import { log } from "@/lib/utils/logger";
import type { BuilderNode, LayoutDSL } from "../../../../lib/types/nodes";
import { BuilderNodeSchema } from "../../../../lib/schemas/nodes";
import {
  restoreLayoutSlotsFromSnapshot,
  snapshotLayoutSlots,
} from "../../../../lib/layouts/slotEditing";
import { useLayerReorderHistory } from "./useLayerReorderHistory";

interface UseLayerHistoryOptions {
  blocks: Ref<BuilderNode[] | undefined>;
  currentLayout?: Ref<LayoutDSL | null | undefined>;
  currentItemType: Ref<"page" | "layout" | "component" | undefined>;
  currentItemSlug: Ref<string | undefined>;
  emitUpdateBlocks: (blocks: BuilderNode[]) => void;
}

const ReorderHistoryInputSchema = z.object({
  newBlocks: z.array(BuilderNodeSchema),
  description: z.string().min(1),
});

export interface LayerStateChangeRecord {
  previousBlocks: BuilderNode[];
  nextBlocks: BuilderNode[];
  description: string;
  previousLayoutSnapshot?: string;
  nextLayoutSnapshot?: string;
}

export function useLayerHistory(options: UseLayerHistoryOptions) {
  const {
    blocks,
    currentLayout,
    currentItemType,
    currentItemSlug,
    emitUpdateBlocks,
  } = options;
  const { recordLayerReorder } = useLayerReorderHistory();

  const historyGroupKey = computed(() => {
    return `layers-reorder:${currentItemType.value || "unknown"}:${currentItemSlug.value || "unknown"}`;
  });

  const recordStateChange = (input: LayerStateChangeRecord): void => {
    void recordLayerReorder({
      previousBlocks: cloneDeep(input.previousBlocks),
      nextBlocks: cloneDeep(input.nextBlocks),
      description: input.description,
      itemType: currentItemType.value,
      itemSlug: currentItemSlug.value,
      previousLayoutSnapshot: input.previousLayoutSnapshot,
      nextLayoutSnapshot: input.nextLayoutSnapshot,
      applyBlocks: (updatedBlocks) => {
        emitUpdateBlocks(updatedBlocks);
      },
      applyLayoutSnapshot:
        currentLayout && input.previousLayoutSnapshot
          ? (snapshot) => {
              if (!currentLayout.value) {
                return;
              }
              currentLayout.value = restoreLayoutSlotsFromSnapshot(
                currentLayout.value,
                snapshot,
              ) as LayoutDSL;
            }
          : undefined,
    }).then((result) => {
      if (!result.success) {
        log("error", "[LayerPanel] Failed to execute reorder history", {
          groupKey: historyGroupKey.value,
          error: result.error,
        });
      }
    });
  };

  const updateBlocksWithHistory = (
    newBlocks: BuilderNode[],
    description: string,
  ): void => {
    const validation = ReorderHistoryInputSchema.safeParse({
      newBlocks,
      description,
    });

    if (!validation.success) {
      log("error", "[LayerPanel] Invalid reorder history payload", {
        issues: validation.error.issues,
      });
      return;
    }

    const previousBlocks = cloneDeep(blocks.value || []);
    const nextBlocks = cloneDeep(validation.data.newBlocks);
    const previousLayoutSnapshot = currentLayout?.value
      ? snapshotLayoutSlots(currentLayout.value)
      : undefined;

    emitUpdateBlocks(nextBlocks);

    const nextLayoutSnapshot = currentLayout?.value
      ? snapshotLayoutSlots(currentLayout.value)
      : undefined;

    recordStateChange({
      previousBlocks,
      nextBlocks,
      description: validation.data.description,
      previousLayoutSnapshot,
      nextLayoutSnapshot,
    });
  };

  return {
    updateBlocksWithHistory,
    recordStateChange,
  };
}
