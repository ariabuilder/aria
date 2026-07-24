import { nextTick, ref, watch, type Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type { CollapseState } from "../types";
import { collectAllNodeIds } from "../utils/nodeHelpers";

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

const EXPAND_ALL_BATCH_SIZE = 250;

const scheduleNextFrame = (callback: () => void): void => {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }

  setTimeout(callback, 16);
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
  let expandAllRunId = 0;

  const isExpanded = (nodeId: string): boolean => {
    return expandedNodes.value.has(nodeId);
  };

  const invalidateExpandableSnapshot = (): void => {
    expandableSnapshot.value = null;
    isAllExpanded.value = false;
  };

  const collectExpandableIds = (): Set<string> => {
    if (expandableSnapshot.value) {
      return new Set(expandableSnapshot.value);
    }

    const allIds = new Set(collectAllNodeIds(currentPageNodes.value));

    if (currentLayout.value?.slots) {
      for (const slot of currentLayout.value.slots) {
        allIds.add(slot.name);
        if (resolveSlotRoots) {
          for (const nodeId of collectAllNodeIds(resolveSlotRoots(slot.name))) {
            allIds.add(nodeId);
          }
        }
      }
    }

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

  const isEveryExpandableIdExpanded = (): boolean => {
    const allIds = collectExpandableIds();
    if (allIds.size === 0) {
      return false;
    }

    for (const id of allIds) {
      if (!expandedNodes.value.has(id)) {
        return false;
      }
    }

    return true;
  };

  const getCollapseState = (nodeId: string): CollapseState => {
    return collapseState.value.get(nodeId) ?? "expanded";
  };

  const toggleExpand = (nodeId: string, event?: Event): void => {
    event?.stopPropagation();
    const expanded = new Set(expandedNodes.value);

    if (expanded.has(nodeId)) {
      expanded.delete(nodeId);
      collapseState.value.set(nodeId, "soft-collapsed");
      isAllExpanded.value = false;
    } else {
      expanded.add(nodeId);
      collapseState.value.set(nodeId, "expanded");
    }

    expandedNodes.value = expanded;
    refreshIsAllExpandedFromSnapshot();
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
    const allIds = Array.from(collectExpandableIds());
    const nextExpanded = new Set(expandedNodes.value);
    const runId = ++expandAllRunId;

    if (allIds.length <= EXPAND_ALL_BATCH_SIZE) {
      allIds.forEach((id) => {
        nextExpanded.add(id);
        collapseState.value.set(id, "expanded");
      });
      expandedNodes.value = nextExpanded;
      isAllExpanded.value = true;
      return;
    }

    let index = 0;
    const applyBatch = (): void => {
      if (runId !== expandAllRunId) {
        return;
      }

      const batchEnd = Math.min(index + EXPAND_ALL_BATCH_SIZE, allIds.length);
      for (; index < batchEnd; index += 1) {
        const id = allIds[index];
        nextExpanded.add(id);
        collapseState.value.set(id, "expanded");
      }
      expandedNodes.value = new Set(nextExpanded);

      if (index < allIds.length) {
        scheduleNextFrame(applyBatch);
      } else {
        isAllExpanded.value = true;
      }
    };

    applyBatch();
  };

  const collapseAll = (): void => {
    expandAllRunId += 1;
    expandedNodes.value.clear();
    isAllExpanded.value = false;
  };

  const toggleAll = (): void => {
    if (isEveryExpandableIdExpanded()) {
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

    const expanded = new Set(expandedNodes.value);
    ancestors.forEach((ancestorId) => {
      expanded.add(ancestorId);
    });
    expanded.add(slotGroupKey ?? currentVirtualSlot.value);
    expandedNodes.value = expanded;
  };

  watch(currentItemSlug, () => {
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

  return {
    expandedNodes,
    collapseState,
    isAllExpanded,
    collectExpandableIds,
    isExpanded,
    getCollapseState,
    toggleExpand,
    toggleAll,
    expandAncestors,
    runInitialExpansion,
  };
}
