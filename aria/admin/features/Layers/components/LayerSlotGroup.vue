<script setup lang="ts">
import { computed, ref, watch } from "vue";
import draggable from "vuedraggable";
import { LayerNodeRecursive } from "./LayerNodeRecursive";
import type { BuilderNode } from "../../../../lib/types/nodes";
import type {
  CollapseState,
  DropIndicatorClass,
  DropPosition,
  LayerDragEvent,
  LayerListChangeEvent,
  LayerSelectRequest,
} from "../types";
import type { NodeEventHandlers } from "../composables/useLayerNodeActions";
import { createSlotDragConfig } from "../utils/dragConfig";
import { didDragLeaveElement } from "../utils/dropTargeting";
import { studioIcons } from "@/lib/icons";

const SLOT_TAIL_ZONE_HEIGHT_PX = 18;

const props = withDefaults(
  defineProps<{
    slotName: string;
    slotLabel: string;
    nodes: BuilderNode[];
    isExpanded: boolean;
    selectedNodeId?: string;
    selectedNodeIds?: string[];
    selectedNodePath?: readonly string[];
    hoveredNodeId?: string;
    editingNodeId: string | null;
    draggableKey: number;
    showEmptyHint: boolean;
    emptyHintText?: string;
    addButtonTitle: string;
    iconClass?: string;
    iconStyle?: Record<string, string>;
    forceMinHeight?: boolean;
    isActiveSlot?: boolean;
    nodeActions: NodeEventHandlers;
    isDragging?: boolean;
    isActiveDragList?: boolean;
    activeDragListId?: string | null;
    dropTargetId?: string | null;
    dropTargetPosition?: DropPosition;
    visibleNodeIds?: ReadonlySet<string> | null;
    isNodeExpanded: (nodeId: string) => boolean;
    hasChildren: (node: BuilderNode) => boolean;
    canAcceptChildren: (node: BuilderNode) => boolean;
    getCollapseState: (nodeId: string) => CollapseState;
    getDropIndicatorClass: (nodeId: string) => DropIndicatorClass;
    renderCacheKey?: string | number;
  }>(),
  {
    emptyHintText: "empty",
    iconClass: "text-primary mr-2",
    iconStyle: undefined,
    forceMinHeight: false,
    isDragging: false,
    isActiveDragList: false,
    activeDragListId: null,
    dropTargetId: null,
    dropTargetPosition: "inside",
    renderCacheKey: 0,
  },
);

const emit = defineEmits<{
  "toggle-expand": [slotName: string, event: Event];
  "activate-slot": [slotName: string];
  "open-picker": [slotName: string];
  "drag-start": [event: LayerDragEvent];
  "drag-end": [];
  "slot-change": [event: LayerListChangeEvent, slotName: string];
  "select-node": [request: LayerSelectRequest];
  "hover-node": [node: BuilderNode];
  "leave-node": [];
  "toggle-node-expand": [nodeId: string, event: Event];
  "update-children": [
    parentNode: BuilderNode,
    changeEvent: LayerListChangeEvent,
  ];
  "rename-node": [node: BuilderNode, newLabel: string];
  "edit-start": [nodeId: string];
  "edit-cancel": [];
  "slot-drop-target-change": [
    payload: { slotName: string; position: DropPosition },
  ];
  "slot-drop-target-leave": [];
  "children-drop-target-change": [
    payload: { parentNodeId: string; position: DropPosition },
  ];
  "children-drop-target-leave": [];
  "drop-target-change": [
    payload: { targetNode: BuilderNode; position: DropPosition },
  ];
  "drop-target-leave": [];
  "drop-node": [payload: { targetNode: BuilderNode; position: DropPosition }];
  "edit-component": [masterId: string];
  "expand-slot-on-drag": [slotName: string];
}>();

const slotDropTargetId = computed(() => `slot:${props.slotName}`);

const hasVisibleNode = (nodes: readonly BuilderNode[]): boolean => {
  if (props.visibleNodeIds === null || props.visibleNodeIds === undefined) {
    return true;
  }

  return nodes.some(
    (node) =>
      props.visibleNodeIds?.has(node.id) || hasVisibleNode(node.children ?? []),
  );
};

const slotDropIndicatorClass = computed(() =>
  props.getDropIndicatorClass(slotDropTargetId.value),
);

const showEmptySlotDropIndicator = computed(
  () =>
    props.nodes.length === 0 && slotDropIndicatorClass.value === "drop-inside",
);

const showTailSlotDropIndicator = computed(
  () => props.nodes.length > 0 && slotDropIndicatorClass.value === "drop-after",
);

const slotDragOptions = computed(() => createSlotDragConfig());
const hasMountedSlotBody = ref(false);

watch(
  () => props.isExpanded,
  (isExpanded) => {
    if (isExpanded) {
      hasMountedSlotBody.value = true;
    }
  },
  { immediate: true },
);

const ensureSlotExpandedForDrag = (): void => {
  if (props.isDragging && !props.isExpanded) {
    emit("expand-slot-on-drag", props.slotName);
  }
};

const handleEmptySlotDragOver = (event: DragEvent): void => {
  if (props.nodes.length > 0) {
    return;
  }

  event.preventDefault();
  ensureSlotExpandedForDrag();
  emit("slot-drop-target-change", {
    slotName: props.slotName,
    position: "inside",
  });
};

const handleEmptySlotDragLeave = (event: DragEvent): void => {
  if (props.nodes.length > 0) {
    return;
  }

  const zone = event.currentTarget;
  if (zone instanceof HTMLElement && !didDragLeaveElement(event, zone)) {
    return;
  }

  emit("slot-drop-target-leave");
};

const handleEmptySlotDrop = (): void => {
  if (props.nodes.length > 0) {
    return;
  }

  emit("slot-drop-target-leave");
};

const handleSlotListDragOver = (event: DragEvent): void => {
  if (props.nodes.length === 0) {
    event.preventDefault();
    event.stopPropagation();
    ensureSlotExpandedForDrag();
    emit("slot-drop-target-change", {
      slotName: props.slotName,
      position: "inside",
    });
    return;
  }

  const target = event.target as HTMLElement | null;
  if (target?.closest("[data-layer-item]")) {
    return;
  }

  const currentTarget = event.currentTarget;
  if (!(currentTarget instanceof HTMLElement)) {
    return;
  }

  const rect = currentTarget.getBoundingClientRect();
  if (event.clientY < rect.bottom - SLOT_TAIL_ZONE_HEIGHT_PX) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }

  ensureSlotExpandedForDrag();
  emit("slot-drop-target-change", {
    slotName: props.slotName,
    position: "after",
  });
};

const handleSlotHeaderDragOver = (event: DragEvent): void => {
  if (!props.isDragging) {
    return;
  }

  event.preventDefault();
  ensureSlotExpandedForDrag();
};

const handleSlotListDragLeave = (event: DragEvent): void => {
  event.stopPropagation();
  const list = event.currentTarget;
  if (list instanceof HTMLElement && !didDragLeaveElement(event, list)) {
    return;
  }

  emit("slot-drop-target-leave");
};

const handleSlotListDrop = (event: DragEvent): void => {
  event.stopPropagation();
  emit("slot-drop-target-leave");
};

const handleChevronClick = (event: Event): void => {
  event.stopPropagation();
  emit("activate-slot", props.slotName);
  emit("toggle-expand", props.slotName, event);
};

const handleSlotHeaderClick = (event: MouseEvent): void => {
  if ((event.target as HTMLElement).closest("button[aria-expanded]")) {
    return;
  }

  emit("activate-slot", props.slotName);
  if (!props.isExpanded) {
    emit("toggle-expand", props.slotName, event);
  }
};
</script>

<template>
  <div
    v-if="hasVisibleNode(props.nodes)"
    data-layer-slot-group
    :data-layer-slot-name="props.slotName"
  >
    <div
      data-layer-slot-header
      :class="[
        'group flex h-8 items-center border-l-2 border-l-transparent px-2.5 transition-colors',
        props.isActiveSlot
          ? 'border-l-primary bg-primary/8'
          : 'hover:bg-primary/4',
      ]"
      @click="handleSlotHeaderClick"
      @dragover="handleSlotHeaderDragOver"
    >
    <button
      type="button"
      class="flex items-center justify-center mr-2 w-5 h-5 rounded hover:bg-muted/60"
      :aria-expanded="props.isExpanded"
      @click="handleChevronClick"
    >
      <div
        :class="[
          studioIcons.chevronRight,
          'transition-all text-muted-foreground/80 w-2.5 h-2.5',
          props.isExpanded ? 'rotate-90' : '',
        ]"
      />
    </button>
    <span
      class="flex-1 text-left font-serif text-2xs font-medium uppercase tracking-[0.14em] transition-colors duration-100"
      :class="
        props.isActiveSlot
          ? 'text-primary'
          : 'text-muted-foreground/80 group-hover:text-foreground'
      "
    >
      {{ props.slotLabel }}
    </span>
    <span
      v-if="props.showEmptyHint && props.nodes.length === 0"
      class="text-4xs text-muted-foreground/50 tracking-widest font-mono ml-2 shrink-0"
    >
      {{ props.emptyHintText }}
    </span>
  </div>

  <div
    v-if="hasMountedSlotBody"
    v-show="props.isExpanded"
    :key="`slot-${props.slotName}`"
  >
    <div
      data-layer-slot-drop-zone
      :class="[
        'layer-slot-drop-zone',
        props.forceMinHeight || props.nodes.length > 0 ? 'min-h-3' : 'min-h-9',
        showEmptySlotDropIndicator ? 'layer-slot-drop-zone--inside' : '',
      ]"
      @dragover="handleEmptySlotDragOver"
      @dragleave="handleEmptySlotDragLeave"
      @drop="handleEmptySlotDrop"
    >
      <draggable
        :key="`draggable-${props.slotName}-${props.draggableKey}`"
        v-bind="slotDragOptions"
        :model-value="props.nodes"
        data-layer-slot-list
        :class="[
          'layer-slot-list border-t border-dashed border-border/70 text-foreground',
          props.isActiveSlot ? 'bg-primary/4' : 'bg-transparent',
          props.forceMinHeight || props.nodes.length > 0 ? 'min-h-3' : 'min-h-9',
          props.isDragging ? 'layer-slot-list--dragging' : '',
          showTailSlotDropIndicator ? 'layer-slot-list--drop-after' : '',
        ]"
        @start="emit('drag-start', $event)"
        @end="emit('drag-end')"
        @dragover="handleSlotListDragOver"
        @dragleave="handleSlotListDragLeave"
        @drop="handleSlotListDrop"
        @change="
          (evt: LayerListChangeEvent) =>
            emit('slot-change', evt, props.slotName)
        "
      >
        <template #item="{ element: node }">
          <LayerNodeRecursive
            :node="node"
            :depth="0"
            :render-cache-key="props.renderCacheKey"
            :selected-node-id="props.selectedNodeId"
            :selected-node-ids="props.selectedNodeIds"
            :selected-node-path="props.selectedNodePath"
            :hovered-node-id="props.hoveredNodeId"
            :editing-node-id="props.editingNodeId"
            :node-actions="props.nodeActions"
            :active-drag-list-id="props.activeDragListId"
            :is-dragging="props.isDragging"
            :is-expanded="props.isNodeExpanded"
            :has-children="props.hasChildren"
            :can-accept-children="props.canAcceptChildren"
            :get-collapse-state="props.getCollapseState"
            :get-drop-indicator-class="props.getDropIndicatorClass"
            :visible-node-ids="props.visibleNodeIds"
            @select="emit('select-node', $event)"
            @hover="emit('hover-node', $event)"
            @leave="emit('leave-node')"
            @drag-start="emit('drag-start', $event)"
            @drag-end="emit('drag-end')"
            @toggle-expand="
              (nodeId: string, event: Event) =>
                emit('toggle-node-expand', nodeId, event)
            "
            @update-children="
              (parentNode: BuilderNode, changeEvent: LayerListChangeEvent) =>
                emit('update-children', parentNode, changeEvent)
            "
            @rename="
              (nodeValue: BuilderNode, newLabel: string) =>
                emit('rename-node', nodeValue, newLabel)
            "
            @edit-start="emit('edit-start', $event)"
            @edit-cancel="emit('edit-cancel')"
            @children-drop-target-change="
              emit('children-drop-target-change', $event)
            "
            @children-drop-target-leave="emit('children-drop-target-leave')"
            @drop-target-change="emit('drop-target-change', $event)"
            @drop-target-leave="emit('drop-target-leave')"
            @drop-node="emit('drop-node', $event)"
            @edit-component="emit('edit-component', $event)"
          />
        </template>
      </draggable>
    </div>
  </div>
  </div>
</template>

<style scoped>
.layer-slot-drop-zone--inside {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--primary) 70%, transparent);
}

.layer-slot-list {
  position: relative;
}

.layer-slot-list--dragging {
  padding-bottom: 0.75rem;
}

.layer-slot-list--drop-after::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent);
  pointer-events: none;
}
</style>
