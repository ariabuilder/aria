import { computed, getCurrentScope, onScopeDispose, type Ref } from "vue";
import { log } from "@/lib/utils/logger";
import type { BuilderNode, LayoutDSL } from "../../../../lib/types/nodes";
import { restoreLayoutSlotsFromSnapshot } from "../../../../lib/layouts/slotEditing";
import { useLayerReorderHistory } from "./useLayerReorderHistory";

interface UseLayerHistoryOptions {
  blocks: Ref<BuilderNode[] | undefined>;
  currentLayout?: Ref<LayoutDSL | null | undefined>;
  currentItemType: Ref<"page" | "layout" | "component" | undefined>;
  currentItemSlug: Ref<string | undefined>;
  emitUpdateBlocks: (blocks: BuilderNode[]) => void;
}

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

  const queuedStateChanges: LayerStateChangeRecord[] = [];
  let historyFrameId: number | null = null;
  let historyTimerId: ReturnType<typeof setTimeout> | null = null;
  let historyChain = Promise.resolve();

  const flushQueuedStateChanges = (): void => {
    historyTimerId = null;
    const queued = queuedStateChanges.splice(0);

    for (const input of queued) {
      historyChain = historyChain
        .then(async () => {
          const result = await recordLayerReorder({
            previousBlocks: input.previousBlocks,
            nextBlocks: input.nextBlocks,
            description: input.description,
            itemType: currentItemType.value,
            itemSlug: currentItemSlug.value,
            alreadyApplied: true,
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
          });

          if (!result.success) {
            log("error", "[LayerPanel] Failed to execute reorder history", {
              groupKey: historyGroupKey.value,
              error: result.error,
            });
          }
        })
        .catch((error: unknown) => {
          log("error", "[LayerPanel] Failed to record reorder history", {
            groupKey: historyGroupKey.value,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }
  };

  const scheduleHistoryFlush = (): void => {
    if (historyFrameId !== null || historyTimerId !== null) {
      return;
    }

    if (typeof requestAnimationFrame === "function") {
      historyFrameId = requestAnimationFrame(() => {
        historyFrameId = null;
        historyTimerId = setTimeout(flushQueuedStateChanges, 0);
      });
      return;
    }

    historyTimerId = setTimeout(flushQueuedStateChanges, 0);
  };

  const recordStateChange = (input: LayerStateChangeRecord): void => {
    queuedStateChanges.push(input);
    scheduleHistoryFlush();
  };

  const updateBlocksWithHistory = (
    newBlocks: BuilderNode[],
    description: string,
  ): void => {
    if (!Array.isArray(newBlocks) || !description.trim()) {
      log("error", "[LayerPanel] Invalid reorder history payload", {
        description,
      });
      return;
    }

    const previousBlocks = blocks.value || [];
    emitUpdateBlocks(newBlocks);

    recordStateChange({
      previousBlocks,
      nextBlocks: newBlocks,
      description,
    });
  };

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (historyFrameId !== null) {
        if (typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(historyFrameId);
        } else {
          clearTimeout(historyFrameId);
        }
      }
      if (historyTimerId !== null) {
        clearTimeout(historyTimerId);
      }
      queuedStateChanges.length = 0;
    });
  }

  return {
    updateBlocksWithHistory,
    recordStateChange,
  };
}
