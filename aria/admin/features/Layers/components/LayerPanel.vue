<!-- Layer tree panel: slots, drag-drop, and canvas selection sync. -->
<script setup lang="ts">
import { ref, computed, onMounted, inject, nextTick, watch } from "vue";
import { APP_INJECTION_KEYS } from "../../Core/types/injectionKeys";
import { getLayoutDefaultSlotName } from "../../../../lib/layouts/resolveNodeSlot";
import { syncLayoutSlotOnNodeSelect } from "../../Core";
import { clearInsertionContextSingleton } from "../../../composables/useInsertionContext";
import { useBeacon } from "../../Beacon";
import LayerSlotsView from "./LayerSlotsView.vue";
import { useDropZones } from "../composables/useDropZones";
import { useLayerTreeActions } from "../composables/useLayerTreeActions";
import {
  useLayerNodeActions,
  type NodeEventHandlers,
} from "../composables/useLayerNodeActions";
import { useLayerCanvasSignals } from "../composables/useLayerCanvasSignals";
import { useLayerExpansion } from "../composables/useLayerExpansion";
import { useLayerHistory } from "../composables/useLayerHistory";
import { useLayerKeyboardNavigation } from "../composables/useLayerKeyboardNavigation";
import { useLayerPanelState } from "../composables/useLayerPanelState";
import { useLayerUiActions } from "../composables/useLayerUiActions";
import { studioIcons } from "@/lib/icons";
import {
  findNodeById,
  getNodeLabel,
  getNodePath,
  traverseNodes,
} from "../utils/nodeHelpers";
import { resolveDragListId } from "../utils/dragConfig";
import { VIRTUAL_SLOT_NAMES } from "../types";

import type { BuilderNode } from "../../../../lib/types/nodes";
import type {
  DropPosition,
  LayerDragEvent,
  LayerListChangeEvent,
} from "../types";

// Flexible layout type that accepts partial layouts from various sources
interface LayoutInfo {
  id?: string;
  name?: string;
  slots?: Array<{
    name: string;
    label?: string;
    description?: string;
    isDefault?: boolean;
    defaultContent?: BuilderNode[];
  }>;
}

// Component Props & Emits

const props = defineProps<{
  allLayersExpanded?: boolean;
  blocks?: BuilderNode[];
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
  currentLayout?: LayoutInfo;
  showSlotGroups?: boolean;
  searchQuery?: string;
}>();

const emit = defineEmits<{
  "update:blocks": [blocks: BuilderNode[]];
  "update:allLayersExpanded": [expanded: boolean];
  updateLayout: [layoutSlug: string];
  openPicker: [slotName: string];
  "edit-component": [masterId: string];
}>();

const activeLayoutSlot = inject(APP_INJECTION_KEYS.activeLayoutSlot, null);
const editorNodeRegistry = inject(APP_INJECTION_KEYS.editorNodeRegistry, null);
const appNodeEventHandlers = inject(APP_INJECTION_KEYS.nodeEventHandlers, null);
const pageBlocksRef = inject(APP_INJECTION_KEYS.pageBlocks, null);
const currentLayoutRef = inject(APP_INJECTION_KEYS.currentLayout, null);

if (editorNodeRegistry && (!pageBlocksRef || !currentLayoutRef)) {
  throw new Error(
    "LayerPanel requires pageBlocks and currentLayout from App provide/inject when editorNodeRegistry is available",
  );
}

/** Writable app ref for mutations (registry + history). Props lag one render behind. */
const editorBlocks = pageBlocksRef ?? computed(() => props.blocks);

const editorLayoutForRead = computed(
  () => currentLayoutRef?.value ?? props.currentLayout ?? undefined,
);

const activeSlotName = computed(
  () =>
    activeLayoutSlot?.activeSlot.value.name ??
    getLayoutDefaultSlotName(props.currentLayout),
);

const layersTreeRef = ref<HTMLElement | null>(null);

const handleActivateSlot = (slotName: string): void => {
  const layout = props.currentLayout ?? null;
  const defaultSlot = getLayoutDefaultSlotName(layout);
  clearInsertionContextSingleton();
  clearSelection();

  if (slotName === defaultSlot) {
    activeLayoutSlot?.resetToPageScope();
  } else if (activeLayoutSlot) {
    activeLayoutSlot.enterSlot(slotName, { layout });
  }

  layersTreeRef.value?.focus({ preventScroll: true });
};

const {
  focusedNodeId,
  selectedNodeIds,
  selectionAnchorNodeId,
  illuminate: focusNode,
  toggleSelection,
  clearSelection,
  replaceSelection,
} = useBeacon();

// Hover state for syncing with canvas
const hoveredNodeId = ref<string | null>(null);

// Force draggable re-render on block updates
const draggableKey = ref(0);
const layerTreeVersion = ref(0);
const isLayerDragging = ref(false);
const activeDragListId = ref<string | null>(null);
// Only one node can be in edit mode at a time
const editingNodeId = ref<string | null>(null);

const { updateBlocksWithHistory, recordStateChange } = useLayerHistory({
  blocks: editorBlocks,
  currentLayout: currentLayoutRef ?? undefined,
  currentItemType: computed(() => props.currentItemType),
  currentItemSlug: computed(() => props.currentItemSlug),
  emitUpdateBlocks: (blocks) => emit("update:blocks", blocks),
});

const {
  currentPageNodes,
  currentVirtualSlot,
  showSlots,
  hasLayers,
  hasChildren,
  canAcceptChildren,
} = useLayerPanelState({
  blocks: computed(() => props.blocks),
  currentItemType: computed(() => props.currentItemType),
  currentLayout: computed(() => props.currentLayout),
});

/** Effective showSlots that respects the slot groups toggle preference. */
const effectiveShowSlots = computed(
  () => showSlots.value && (props.showSlotGroups ?? true),
);

/**
 * When slot groups are hidden, resolve the default layout slot name
 * so getNodesInSlot returns the actual main content nodes rather than an.
 */
const contentSlotName = computed(() => {
  if (showSlots.value && !props.showSlotGroups) {
    const defaultSlot = getLayoutDefaultSlotName(props.currentLayout ?? null);
    if (defaultSlot) return defaultSlot;
  }
  return currentVirtualSlot.value;
});

const buildNodeStructureSignature = (
  nodes: readonly BuilderNode[] | undefined,
): string => {
  if (!nodes?.length) {
    return "";
  }

  return nodes
    .map((node) => {
      const children = buildNodeStructureSignature(node.children);
      return children ? `${node.id}(${children})` : node.id;
    })
    .join(",");
};

const layerStructureSignature = computed(() => {
  const blocksSignature = buildNodeStructureSignature(editorBlocks.value ?? []);
  const layoutSignature =
    editorLayoutForRead.value?.slots
      ?.map((slot) => {
        const defaultContentSignature = buildNodeStructureSignature(
          slot.defaultContent,
        );
        return `${slot.name}:${defaultContentSignature}`;
      })
      .join("|") ?? "";

  return [
    props.currentItemType ?? "",
    props.currentItemSlug ?? "",
    layoutSignature,
    blocksSignature,
  ].join("::");
});

const itemRenderCacheKey = computed(
  () =>
    `${props.currentItemType ?? ""}:${props.currentItemSlug ?? ""}:${
      editorLayoutForRead.value?.id ?? editorLayoutForRead.value?.name ?? ""
    }`,
);

const getSlotRenderCacheKey = (
  slotName: string,
  nodes: readonly BuilderNode[],
): string =>
  [
    itemRenderCacheKey.value,
    slotName,
    buildNodeStructureSignature(nodes),
  ].join("::");

watch(
  layerStructureSignature,
  (_next, previous) => {
    if (previous !== undefined) {
      layerTreeVersion.value += 1;
    }
  },
);

const {
  expandedNodes,
  collapseState,
  isAllExpanded,
  isExpanded,
  getCollapseState,
  toggleExpand,
  toggleAll,
  expandAncestors,
  runInitialExpansion,
} = useLayerExpansion({
  blocks: editorBlocks,
  currentPageNodes,
  currentLayout: editorLayoutForRead,
  currentItemSlug: computed(() => props.currentItemSlug),
  currentItemType: computed(() => props.currentItemType),
  currentVirtualSlot,
  virtualSlotNames: VIRTUAL_SLOT_NAMES,
  resolveSlotRoots: (slotName) =>
    editorNodeRegistry?.getDisplayNodesForSlot(slotName) ?? [],
});

const {
  getNodesInSlot,
  handleDragStart,
  handleDragEnd,
  handleDropOnNode,
  handleSlotChange,
  handleChildrenUpdate,
} = useLayerTreeActions({
  blocks: editorBlocks,
  currentLayout: editorLayoutForRead,
  currentItemType: computed(() => props.currentItemType),
  virtualSlotNames: {
    PAGE_CONTENT: VIRTUAL_SLOT_NAMES.PAGE_CONTENT,
    COMPONENT_CONTENT: VIRTUAL_SLOT_NAMES.COMPONENT_CONTENT,
  },
  hasChildren,
  expandedNodes,
  collapseState,
  updateBlocksWithHistory,
  recordStateChange,
  nodeRegistry: editorNodeRegistry,
  onLayoutSlotsDirty: () => {
    // Dirty state is derived from layout snapshot watch in useAppInitialization.
  },
  onTreeStructureChanged: () => {
    layerTreeVersion.value += 1;
    if (isLayerDragging.value) {
      return;
    }
    draggableKey.value += 1;
  },
});

/**
 * Nodes forwarded to LayerSlotsView for the v-if check when slot groups
 * are hidden — ensures the tree renders with the default slot's content.
 */
const contentNodes = computed(() => {
  if (showSlots.value && !props.showSlotGroups) {
    const defaultSlot = getLayoutDefaultSlotName(props.currentLayout ?? null);
    if (defaultSlot) return getNodesInSlot(defaultSlot);
  }
  return currentPageNodes.value;
});

const normalizedSearchQuery = computed(
  () => props.searchQuery?.trim().toLowerCase() ?? "",
);

const getLayerSearchText = (node: BuilderNode): string =>
  [
    getNodeLabel(node),
    node.type,
    node.metadata?.label,
    node.componentRef,
    node.props?.text,
    node.props?.heading,
    node.props?.title,
    node.props?.content,
    node.props?.alt,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

/**
 * Filter presentation only: the source node arrays stay intact, keeping
 * drag/drop and mutations bound to their original nodes.
 */
const searchVisibleNodeIds = computed<ReadonlySet<string> | null>(() => {
  const query = normalizedSearchQuery.value;
  if (!query) {
    return null;
  }

  const visibleIds = new Set<string>();
  const roots = effectiveShowSlots.value
    ? (editorLayoutForRead.value?.slots ?? []).flatMap((slot) =>
        editorNodeRegistry?.getDisplayNodesForSlot(slot.name) ??
        getNodesInSlot(slot.name),
      )
    : contentNodes.value;

  traverseNodes(roots, (node, path) => {
    if (!getLayerSearchText(node).includes(query)) {
      return;
    }

    for (const id of path) {
      visibleIds.add(id);
    }
  });

  return visibleIds;
});

const hasSearchResults = computed(
  () =>
    searchVisibleNodeIds.value === null ||
    searchVisibleNodeIds.value.size > 0,
);

let searchExpansionSnapshot: Set<string> | null = null;

watch(
  searchVisibleNodeIds,
  (visibleNodeIds, previousVisibleNodeIds) => {
    if (visibleNodeIds === null) {
      if (searchExpansionSnapshot) {
        expandedNodes.value = searchExpansionSnapshot;
        searchExpansionSnapshot = null;
      }
      return;
    }

    if (previousVisibleNodeIds === null || searchExpansionSnapshot === null) {
      searchExpansionSnapshot = new Set(expandedNodes.value);
    }

    expandedNodes.value = new Set([
      ...expandedNodes.value,
      ...visibleNodeIds,
    ]);
  },
  { immediate: true },
);

const getVisibleNodeIds = (): string[] => {
  const ids: string[] = [];

  const canShowChildren = (n: BuilderNode): boolean => {
    const state = collapseState.value.get(n.id) ?? "expanded";
    const isCollapsed =
      state === "soft-collapsed" || state === "full-collapsed";
    const isComponentInstance = n.type === "Component" || !!n.componentRef;
    return (
      !isCollapsed && !isComponentInstance && expandedNodes.value.has(n.id)
    );
  };

  const walk = (nodes: BuilderNode[]): void => {
    for (const n of nodes) {
      ids.push(n.id);
      if (hasChildren(n) && canShowChildren(n) && n.children?.length) {
        walk(n.children);
      }
    }
  };

  const blocks = editorBlocks.value ?? [];
  if (blocks.length > 0) walk(blocks);

  const slotNames = editorLayoutForRead.value?.slots?.map((s) => s.name) ?? [];
  for (const slotName of slotNames) {
    const slotRoots = editorNodeRegistry?.getDisplayNodesForSlot(slotName) ?? [];
    walk(slotRoots);
  }

  return ids;
};

const {
  handleSelectNode,
  handleNodeHover,
  handleNodeLeave,
  handleRenameNode,
  handleOpenPicker,
  handleEditStart,
  handleEditCancel,
} = useLayerUiActions({
  focusedNodeId,
  focusNode,
  toggleSelection,
  hoveredNodeId,
  editingNodeId,
  expandedNodes,
  hasChildren,
  toggleExpand,
  blocks: editorBlocks,
  updateBlocksWithHistory,
  emitOpenPicker: (slotName) => emit("openPicker", slotName),
  activeSlotName: computed(() => activeSlotName.value),
  nodeLayoutSlotName: (nodeId) => {
    const located = editorNodeRegistry?.locateNode(nodeId);
    return located?.store.kind === "layout-slot"
      ? located.store.slotName
      : undefined;
  },
  onBeforeSelectNode: (nodeId) => {
    const result = syncLayoutSlotOnNodeSelect({
      nodeId,
      registry: editorNodeRegistry,
      activeLayoutSlot,
      layout: editorLayoutForRead.value ?? null,
    });
    if (result.slotName) {
      expandedNodes.value.add(result.slotName);
      expandedNodes.value = new Set(expandedNodes.value);
    }
    expandAncestors(nodeId);
    return { slotChanged: result.slotChanged, slotName: result.slotName };
  },
  selectionAnchorNodeId,
  replaceSelection,
  getVisibleNodeIds,
});

const handleSlotChangeWithRefresh = (
  event: LayerListChangeEvent,
  slotName: string,
): void => {
  handleSlotChange(event, slotName);
};

const {
  setDropTarget,
  clearDropTarget,
  scheduleClearDropTarget,
  getIndicatorClass,
  dropTargetId,
  dropPosition,
} = useDropZones();

const handleLayerDragStart = (event: LayerDragEvent): void => {
  isLayerDragging.value = true;
  activeDragListId.value = resolveDragListId(event);
  clearDropTarget();
  handleDragStart(event);
};

const handleLayerDragEnd = (): void => {
  activeDragListId.value = null;
  clearDropTarget();
  handleDragEnd();
  isLayerDragging.value = false;
  nextTick(() => {
    draggableKey.value += 1;
  });
};

const handleDropTargetChange = (payload: {
  targetNode: BuilderNode;
  position: DropPosition;
}): void => {
  setDropTarget(payload.targetNode.id, payload.position);
};

const handleDropTargetLeave = (): void => {
  scheduleClearDropTarget();
};

const handleSlotDropTargetChange = (payload: {
  slotName: string;
  position: DropPosition;
}): void => {
  setDropTarget(`slot:${payload.slotName}`, payload.position);
};

const handleSlotDropTargetLeave = (): void => {
  scheduleClearDropTarget();
};

const handleExpandSlotOnDrag = (slotName: string): void => {
  if (!isExpanded(slotName)) {
    toggleExpand(slotName);
  }
};

const handleChildrenDropTargetChange = (payload: {
  parentNodeId: string;
  position: DropPosition;
}): void => {
  setDropTarget(`children:${payload.parentNodeId}`, payload.position);
};

const handleChildrenDropTargetLeave = (): void => {
  scheduleClearDropTarget();
};

const handleLayerDropNode = (payload: {
  targetNode: BuilderNode;
  position: DropPosition;
}): void => {
  clearDropTarget();
  handleDropOnNode(payload.targetNode, payload.position);
};

const handleEditComponent = (masterId: string): void => {
  emit("edit-component", masterId);
};

if (!appNodeEventHandlers) {
  throw new Error(
    "LayerPanel requires nodeEventHandlers from App provide/inject",
  );
}

const { nodeEventHandlers }: { nodeEventHandlers: NodeEventHandlers } =
  useLayerNodeActions({
    appNodeEventHandlers,
  });

const selectedNodePath = computed<readonly string[]>(() => {
  if (!focusedNodeId.value) {
    return [];
  }

  const nodeId = focusedNodeId.value;

  const blocksForPath = editorBlocks.value ?? [];
  if (blocksForPath.length > 0) {
    const pathInPage = getNodePath(blocksForPath, nodeId);
    if (pathInPage.length > 0) {
      return pathInPage;
    }
  }

  const slotNames =
    editorLayoutForRead.value?.slots?.map((slot) => slot.name) ?? [];
  for (const slotName of slotNames) {
    const slotRoots = editorNodeRegistry?.getDisplayNodesForSlot(slotName) ?? [];
    const pathInSlot = getNodePath(slotRoots, nodeId);
    if (pathInSlot.length > 0) {
      return pathInSlot;
    }
  }

  return [];
});

const { handleTreeKeydown } = useLayerKeyboardNavigation({
  currentPageNodes,
  currentLayout: editorLayoutForRead,
  currentItemType: computed(() => props.currentItemType),
  currentVirtualSlot,
  focusedNodeId,
  editingNodeId,
  expandedNodes,
  collapseState,
  getNodesInSlot,
  hasChildren,
  findNodeById,
  selectNode: handleSelectNode,
  setEditingNodeId: (id) => {
    editingNodeId.value = id;
  },
  selectedNodeIds,
  deleteNodesById: (nodeIds) => {
    nodeEventHandlers.handleDeleteBlocks(nodeIds);
  },
  deleteNodeById: nodeEventHandlers.handleDeleteBlock,
});

onMounted(() => {
  runInitialExpansion();
});

watch(
  isAllExpanded,
  (expanded) => {
    emit("update:allLayersExpanded", expanded);
  },
  { immediate: true },
);

defineExpose({
  toggleAll,
  expandAncestors,
  isAllExpanded,
});

useLayerCanvasSignals({
  blocks: editorBlocks,
  currentPageNodes,
  currentLayout: editorLayoutForRead,
  hoveredNodeId,
  findNodeById,
  expandAncestors,
  focusNode,
  toggleSelection,
  clearSelection,
  editorNodeRegistry,
  activeLayoutSlot,
});
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
    <!-- Empty state -->
    <div v-if="!hasLayers">
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <div
          :class="[
            studioIcons.boxLine,
            'mb-2 text-foreground opacity-30 w-6 h-6',
          ]"
        />
        <p class="text-sm text-foreground">No layers yet</p>
      </div>
    </div>

    <!-- Unified layers tree -->
    <div
      v-else
      ref="layersTreeRef"
      class="flex-1 min-h-0 overflow-y-auto px-1 pb-1"
      tabindex="0"
      @keydown="handleTreeKeydown"
      @click="
        (e) => {
          const target = e.target as HTMLElement;
          const layerItem = target.closest('[data-layer-item]');
          if (!layerItem && e.currentTarget === e.target) {
            clearSelection();
            editingNodeId = null;
          }
        }
      "
    >
      <div v-if="hasSearchResults" class="flex flex-col">
        <LayerSlotsView
          :show-slots="effectiveShowSlots"
          :current-layout="currentLayout"
          :current-page-nodes="contentNodes"
          :current-item-type="currentItemType"
          :current-virtual-slot="contentSlotName"
          :selected-node-id="focusedNodeId || undefined"
          :selected-node-ids="selectedNodeIds"
          :selected-node-path="selectedNodePath"
          :hovered-node-id="hoveredNodeId || undefined"
          :editing-node-id="editingNodeId"
          :draggable-key="draggableKey"
          :is-dragging="isLayerDragging"
          :active-drag-list-id="activeDragListId"
          :drop-target-id="dropTargetId"
          :drop-target-position="dropPosition"
          :node-actions="nodeEventHandlers"
          :get-nodes-in-slot="getNodesInSlot"
          :is-expanded="isExpanded"
          :has-children="hasChildren"
          :can-accept-children="canAcceptChildren"
          :get-collapse-state="getCollapseState"
          :get-drop-indicator-class="getIndicatorClass"
          :render-cache-key="itemRenderCacheKey"
          :get-slot-render-cache-key="getSlotRenderCacheKey"
          :active-slot-name="activeSlotName"
          :on-activate-slot="handleActivateSlot"
          :on-expand-slot-on-drag="handleExpandSlotOnDrag"
          :visible-node-ids="searchVisibleNodeIds"
          :on-toggle-expand="toggleExpand"
          :on-open-picker="handleOpenPicker"
          :on-drag-start="handleLayerDragStart"
          :on-drag-end="handleLayerDragEnd"
          :on-slot-change="handleSlotChangeWithRefresh"
          :on-select-node="handleSelectNode"
          :on-hover-node="handleNodeHover"
          :on-leave-node="handleNodeLeave"
          :on-update-children="handleChildrenUpdate"
          :on-rename-node="handleRenameNode"
          :on-edit-start="handleEditStart"
          :on-edit-cancel="handleEditCancel"
          :on-slot-drop-target-change="handleSlotDropTargetChange"
          :on-slot-drop-target-leave="handleSlotDropTargetLeave"
          :on-children-drop-target-change="handleChildrenDropTargetChange"
          :on-children-drop-target-leave="handleChildrenDropTargetLeave"
          :on-drop-target-change="handleDropTargetChange"
          :on-drop-target-leave="handleDropTargetLeave"
          :on-drop-node="handleLayerDropNode"
          :on-edit-component="handleEditComponent"
        />
      </div>
      <div
        v-else
        class="flex h-full flex-col items-center justify-center px-5 text-center"
      >
        <span :class="[studioIcons.search, 'mb-2 size-4 text-muted-foreground']" />
        <p class="text-xs font-medium text-foreground">No matching layers</p>
        <p class="mt-1 text-xs text-muted-foreground">
          Search layer names or element types.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Draggable states */
:deep(.ghost) {
  height: 0;
  min-height: 0;
  overflow: visible;
  padding: 0;
  margin: 0;
  opacity: 0;
  border: none;
  pointer-events: none;
  background: transparent;
  position: relative;
}

:deep(.ghost)::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: var(--primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent);
}

:deep(.dragging) {
  opacity: 0.85;
  transform: rotate(1deg);
}

:deep(.layer-children) {
  display: block;
}
</style>
