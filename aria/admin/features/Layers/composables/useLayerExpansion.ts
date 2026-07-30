import {
  nextTick,
  getCurrentScope,
  onScopeDispose,
  ref,
  watch,
  type Ref,
} from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type { CollapseState } from "../types";

export interface LayerExpansionLayoutInfo {
  slots?: Array<{ name: string }>;
}

export interface LayerExpansionVirtualSlotNames {
  PAGE_CONTENT: string;
  COMPONENT_CONTENT: string;
  UNASSIGNED: string;
}

export interface UseLayerExpansionOptions {
  blocks: Ref<BuilderNode[] | undefined>;
  currentPageNodes: Ref<BuilderNode[]>;
  currentLayout: Ref<LayerExpansionLayoutInfo | undefined>;
  currentItemSlug: Ref<string | undefined>;
  currentItemType: Ref<"page" | "layout" | "component" | undefined>;
  currentVirtualSlot: Ref<string>;
  virtualSlotNames: LayerExpansionVirtualSlotNames;
  resolveSlotRoots?: (slotName: string) => BuilderNode[];
}

const EXPAND_ALL_BATCH_SIZE = 8;
const COLLAPSE_ALL_BATCH_SIZE = 8;
const EXPANSION_BUSY_MIN_MS = 240;

const scheduleNextFrame = (callback: () => void): void => {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }

  setTimeout(callback, 16);
};

const scheduleAfterNextPaint = (callback: () => void): number => {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(() => {
      setTimeout(callback, 0);
    });
  }

  return globalThis.setTimeout(callback, 0) as unknown as number;
};

const cancelScheduledFrame = (frameId: number): void => {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frameId);
    return;
  }

  clearTimeout(frameId);
};

const collectExpandableNodeIds = (
  nodes: readonly BuilderNode[],
  target: Set<string>,
): void => {
  for (const node of nodes) {
    const isComponentInstance =
      node.type === "Component" || Boolean(node.componentRef);
    if (isComponentInstance || !node.children?.length) {
      continue;
    }

    target.add(node.id);
    collectExpandableNodeIds(node.children, target);
  }
};

export function useLayerExpansion(options: UseLayerExpansionOptions) {
  const {
    blocks,
    currentPageNodes,
    currentLayout,
    currentItemSlug,
    currentItemType,
    currentVirtualSlot,
    virtualSlotNames,
    resolveSlotRoots,
  } = options;

  const expandedNodes = ref<Set<string>>(new Set());
  const collapseState = ref<Map<string, CollapseState>>(new Map());
  const hasInitialExpansion = ref(false);
  const expandableSnapshot = ref<Set<string> | null>(null);
  const isAllExpanded = ref(false);
  const expandingNodes = ref<Set<string>>(new Set());
  const isLayerTreeBusy = ref(false);
  const layerTreeOperation = ref<"expanding" | "collapsing" | null>(null);
  const expansionFrameIds = new Map<string, number>();
  const expansionBusyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let expandAllRunId = 0;

  const isExpanded = (nodeId: string): boolean => {
    return expandedNodes.value.has(nodeId);
  };

  const isExpanding = (nodeId: string): boolean => {
    return expandingNodes.value.has(nodeId);
  };

  const setExpanding = (nodeId: string, expanding: boolean): void => {
    if (expanding) {
      expandingNodes.value.add(nodeId);
    } else {
      expandingNodes.value.delete(nodeId);
    }
  };

  const cancelPendingExpansion = (nodeId: string): void => {
    const frameId = expansionFrameIds.get(nodeId);
    if (frameId !== undefined) {
      cancelScheduledFrame(frameId);
      expansionFrameIds.delete(nodeId);
    }

    const busyTimer = expansionBusyTimers.get(nodeId);
    if (busyTimer !== undefined) {
      clearTimeout(busyTimer);
      expansionBusyTimers.delete(nodeId);
    }

    setExpanding(nodeId, false);
  };

  const cancelAllPendingExpansions = (): void => {
    for (const nodeId of expandingNodes.value) {
      cancelPendingExpansion(nodeId);
    }
  };

  const invalidateExpandableSnapshot = (): void => {
    expandableSnapshot.value = null;
    isAllExpanded.value = false;
  };

  const collectExpandableIds = (): Set<string> => {
    if (expandableSnapshot.value) {
      return new Set(expandableSnapshot.value);
    }

    const allIds = new Set<string>();
    allIds.add(currentVirtualSlot.value);
    collectExpandableNodeIds(currentPageNodes.value, allIds);

    if (currentLayout.value?.slots) {
      for (const slot of currentLayout.value.slots) {
        allIds.add(slot.name);
        if (resolveSlotRoots) {
          collectExpandableNodeIds(resolveSlotRoots(slot.name), allIds);
        }
      }
    }

    // Keep unused virtual groups in the snapshot without disturbing the
    // parent-first order of the active tree.
    Object.values(virtualSlotNames).forEach((slotName) => {
      allIds.add(slotName);
    });

    expandableSnapshot.value = new Set(allIds);
    return allIds;
  };

  const refreshIsAllExpandedFromSnapshot = (): void => {
    const allIds = expandableSnapshot.value;
    if (!allIds || allIds.size === 0) {
      isAllExpanded.value = false;
      return;
    }

    for (const id of allIds) {
      if (!expandedNodes.value.has(id)) {
        isAllExpanded.value = false;
        return;
      }
    }

    isAllExpanded.value = true;
  };

  const getCollapseState = (nodeId: string): CollapseState => {
    return collapseState.value.get(nodeId) ?? "expanded";
  };

  const toggleExpand = (nodeId: string, event?: Event): void => {
    event?.stopPropagation();

    if (expandedNodes.value.has(nodeId)) {
      expandedNodes.value.delete(nodeId);
      collapseState.value.set(nodeId, "soft-collapsed");
      isAllExpanded.value = false;
    } else {
      expandedNodes.value.add(nodeId);
      collapseState.value.set(nodeId, "expanded");
    }

    refreshIsAllExpandedFromSnapshot();
  };

  /**
   * Gives the browser a paint opportunity before mounting a cold branch.
   * The synchronous toggle remains available for programmatic tree updates.
   */
  const requestToggleExpand = (nodeId: string, event?: Event): void => {
    event?.stopPropagation();

    if (isLayerTreeBusy.value) {
      return;
    }

    if (isExpanded(nodeId)) {
      cancelPendingExpansion(nodeId);
      toggleExpand(nodeId);
      return;
    }

    if (isExpanding(nodeId)) {
      cancelPendingExpansion(nodeId);
      return;
    }

    setExpanding(nodeId, true);
    const frameId = scheduleAfterNextPaint(() => {
      expansionFrameIds.delete(nodeId);
      if (!isExpanding(nodeId)) {
        return;
      }

      toggleExpand(nodeId);
      const busyTimer = setTimeout(() => {
        expansionBusyTimers.delete(nodeId);
        setExpanding(nodeId, false);
      }, EXPANSION_BUSY_MIN_MS);
      expansionBusyTimers.set(nodeId, busyTimer);
    });
    expansionFrameIds.set(nodeId, frameId);
  };

  const expandSlotsOnly = (): void => {
    const slotIds = new Set<string>();

    if (currentLayout.value?.slots) {
      currentLayout.value.slots.forEach((slot) => {
        slotIds.add(slot.name);
      });
    }

    Object.values(virtualSlotNames).forEach((slotName) => {
      slotIds.add(slotName);
    });

    expandedNodes.value = slotIds;
  };

  const expandAll = (): void => {
    const runId = ++expandAllRunId;
    isLayerTreeBusy.value = true;
    layerTreeOperation.value = "expanding";

    scheduleAfterNextPaint(() => {
      if (runId !== expandAllRunId) {
        return;
      }

      const allIds = Array.from(collectExpandableIds());
      let index = 0;
      const applyBatch = (): void => {
        if (runId !== expandAllRunId) {
          return;
        }

        const batchEnd = Math.min(index + EXPAND_ALL_BATCH_SIZE, allIds.length);
        for (; index < batchEnd; index += 1) {
          const id = allIds[index];
          expandedNodes.value.add(id);
          collapseState.value.set(id, "expanded");
        }

        if (index < allIds.length) {
          scheduleNextFrame(applyBatch);
          return;
        }

        isAllExpanded.value = allIds.length > 0;
        isLayerTreeBusy.value = false;
        layerTreeOperation.value = null;
      };

      applyBatch();
    });
  };

  const collapseAll = (): void => {
    const runId = ++expandAllRunId;
    cancelAllPendingExpansions();
    isAllExpanded.value = false;
    isLayerTreeBusy.value = true;
    layerTreeOperation.value = "collapsing";

    // The cached snapshot is parent-first. Reverse it so small descendant
    // branches unmount before their parent group instead of removing the
    // entire rendered tree in one synchronous update.
    const remainingIds = Array.from(collectExpandableIds())
      .filter((id) => expandedNodes.value.has(id))
      .reverse();
    let index = 0;
    const applyBatch = (): void => {
      if (runId !== expandAllRunId) {
        return;
      }

      const batchEnd = Math.min(
        index + COLLAPSE_ALL_BATCH_SIZE,
        remainingIds.length,
      );
      for (; index < batchEnd; index += 1) {
        expandedNodes.value.delete(remainingIds[index]);
      }

      if (index < remainingIds.length) {
        scheduleNextFrame(applyBatch);
        return;
      }

      isLayerTreeBusy.value = false;
      layerTreeOperation.value = null;
    };

    scheduleAfterNextPaint(applyBatch);
  };

  const toggleAll = (): void => {
    if (isLayerTreeBusy.value) {
      return;
    }

    if (isAllExpanded.value) {
      collapseAll();
    } else {
      expandAll();
    }
  };

  const expandAncestors = (nodeId: string): void => {
    const findAncestorsInRoots = (
      nodes: BuilderNode[],
      targetId: string,
      ancestors: string[] = [],
    ): string[] | null => {
      for (const node of nodes) {
        if (node.id === targetId) {
          return ancestors;
        }
        if (node.children?.length) {
          const found = findAncestorsInRoots(node.children, targetId, [
            ...ancestors,
            node.id,
          ]);
          if (found !== null) {
            return found;
          }
        }
      }
      return null;
    };

    let ancestors = findAncestorsInRoots(currentPageNodes.value, nodeId);
    let slotGroupKey: string | null = null;

    if (!ancestors && resolveSlotRoots) {
      for (const slot of currentLayout.value?.slots ?? []) {
        const slotAncestors = findAncestorsInRoots(
          resolveSlotRoots(slot.name),
          nodeId,
        );
        if (slotAncestors) {
          slotGroupKey = slot.name;
          ancestors = slotAncestors;
          break;
        }
      }
    }

    if (!ancestors) {
      return;
    }

    ancestors.forEach((ancestorId) => {
      expandedNodes.value.add(ancestorId);
    });
    expandedNodes.value.add(slotGroupKey ?? currentVirtualSlot.value);
  };

  watch(currentItemSlug, () => {
    expandAllRunId += 1;
    isLayerTreeBusy.value = false;
    layerTreeOperation.value = null;
    cancelAllPendingExpansions();
    hasInitialExpansion.value = false;
    invalidateExpandableSnapshot();
  });

  watch(currentPageNodes, invalidateExpandableSnapshot);
  watch(currentLayout, invalidateExpandableSnapshot);

  watch(
    blocks,
    (newBlocks) => {
      if (!hasInitialExpansion.value && newBlocks && newBlocks.length > 0) {
        nextTick(() => {
          expandSlotsOnly();
          hasInitialExpansion.value = true;
        });
      }
    },
    { immediate: true },
  );

  watch(
    currentItemType,
    (newType) => {
      const slotName =
        newType === "page"
          ? virtualSlotNames.PAGE_CONTENT
          : virtualSlotNames.COMPONENT_CONTENT;

      expandedNodes.value.add(slotName);
    },
    { immediate: true },
  );

  const runInitialExpansion = (): void => {
    if (blocks.value && blocks.value.length > 0) {
      expandSlotsOnly();
      hasInitialExpansion.value = true;
    }
  };

  if (getCurrentScope()) {
    onScopeDispose(() => {
      expandAllRunId += 1;
      cancelAllPendingExpansions();
    });
  }

  return {
    expandedNodes,
    collapseState,
    isAllExpanded,
    isLayerTreeBusy,
    layerTreeOperation,
    expandingNodes,
    collectExpandableIds,
    isExpanded,
    isExpanding,
    getCollapseState,
    toggleExpand,
    requestToggleExpand,
    toggleAll,
    expandAncestors,
    runInitialExpansion,
  };
}
