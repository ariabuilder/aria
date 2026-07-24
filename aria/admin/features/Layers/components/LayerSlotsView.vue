<script setup lang="ts">
import LayerSlotGroup from "./LayerSlotGroup.vue";
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

interface LayoutInfo {
  slots?: Array<{
    name: string;
    label?: string;
  }>;
}

const props = defineProps<{
  showSlots: boolean;
  currentLayout?: LayoutInfo;
  currentPageNodes: BuilderNode[];
  currentItemType?: "page" | "layout" | "component";
  currentVirtualSlot: string;
  selectedNodeId?: string;
  selectedNodeIds?: string[];
  selectedNodePath?: readonly string[];
  hoveredNodeId?: string;
  editingNodeId: string | null;
  draggableKey: number;
  isDragging: boolean;
  activeDragListId: string | null;
  dropTargetId: string | null;
  dropTargetPosition: DropPosition;
  nodeActions: NodeEventHandlers;
  getNodesInSlot: (slotName: string) => BuilderNode[];
  isExpanded: (nodeId: string) => boolean;
  hasChildren: (node: BuilderNode) => boolean;
  canAcceptChildren: (node: BuilderNode) => boolean;
  getCollapseState: (nodeId: string) => CollapseState;
  getDropIndicatorClass: (nodeId: string) => DropIndicatorClass;
  renderCacheKey?: string | number;
  getSlotRenderCacheKey?: (
    slotName: string,
    nodes: readonly BuilderNode[],
  ) => string | number;
  onToggleExpand: (nodeId: string, event: Event) => void;
  onOpenPicker: (slotName: string) => void;
  onDragStart: (event: LayerDragEvent) => void;
  onDragEnd: () => void;
  onSlotChange: (event: LayerListChangeEvent, slotName: string) => void;
  onSelectNode: (request: LayerSelectRequest) => void;
  onHoverNode: (node: BuilderNode | undefined) => void;
  onLeaveNode: () => void;
  onUpdateChildren: (
    parentNode: BuilderNode,
    changeEvent: LayerListChangeEvent,
  ) => void;
  onRenameNode: (node: BuilderNode, newLabel: string) => void;
  onEditStart: (id: string) => void;
  onEditCancel: () => void;
  onSlotDropTargetChange: (payload: {
    slotName: string;
    position: DropPosition;
  }) => void;
  onSlotDropTargetLeave: () => void;
  onChildrenDropTargetChange: (payload: {
    parentNodeId: string;
    position: DropPosition;
  }) => void;
  onChildrenDropTargetLeave: () => void;
  onDropTargetChange: (payload: {
    targetNode: BuilderNode;
    position: DropPosition;
  }) => void;
  onDropTargetLeave: () => void;
  onDropNode: (payload: {
    targetNode: BuilderNode;
    position: DropPosition;
  }) => void;
  onEditComponent: (masterId: string) => void;
  activeSlotName?: string;
  onActivateSlot: (slotName: string) => void;
  onExpandSlotOnDrag: (slotName: string) => void;
  visibleNodeIds?: ReadonlySet<string> | null;
}>();
</script>

<template>
  <div
    v-if="props.showSlots && props.currentLayout"
    class="space-y-0 overflow-x-hidden"
  >
    <LayerSlotGroup
      v-for="slot in props.currentLayout.slots"
      :key="slot.name"
      :slot-name="slot.name"
      :slot-label="slot.label || slot.name"
      :nodes="props.getNodesInSlot(slot.name)"
      :is-expanded="props.isExpanded(slot.name)"
      :selected-node-id="props.selectedNodeId"
      :selected-node-ids="props.selectedNodeIds"
      :selected-node-path="props.selectedNodePath"
      :hovered-node-id="props.hoveredNodeId"
      :editing-node-id="props.editingNodeId"
      :draggable-key="props.draggableKey"
      :is-dragging="props.isDragging"
      :is-active-drag-list="props.activeDragListId === `slot:${slot.name}`"
      :active-drag-list-id="props.activeDragListId"
      :drop-target-id="props.dropTargetId"
      :drop-target-position="props.dropTargetPosition"
      :node-actions="props.nodeActions"
      :show-empty-hint="true"
      empty-hint-text="empty"
      add-button-title="Add Element to Slot"
      icon-class="text-foreground mr-3"
      :is-active-slot="props.activeSlotName === slot.name"
      :is-node-expanded="props.isExpanded"
      :has-children="props.hasChildren"
      :can-accept-children="props.canAcceptChildren"
      :get-collapse-state="props.getCollapseState"
      :get-drop-indicator-class="props.getDropIndicatorClass"
      :visible-node-ids="props.visibleNodeIds"
      :render-cache-key="
        props.getSlotRenderCacheKey?.(slot.name, props.getNodesInSlot(slot.name)) ??
        props.renderCacheKey
      "
      @toggle-expand="props.onToggleExpand"
      @activate-slot="props.onActivateSlot"
      @open-picker="props.onOpenPicker"
      @drag-start="props.onDragStart"
      @drag-end="props.onDragEnd"
      @slot-change="props.onSlotChange"
      @select-node="props.onSelectNode"
      @hover-node="props.onHoverNode"
      @leave-node="props.onLeaveNode"
      @toggle-node-expand="props.onToggleExpand"
      @update-children="props.onUpdateChildren"
      @rename-node="props.onRenameNode"
      @edit-start="props.onEditStart"
      @edit-cancel="props.onEditCancel"
      @slot-drop-target-change="props.onSlotDropTargetChange"
      @slot-drop-target-leave="props.onSlotDropTargetLeave"
      @children-drop-target-change="props.onChildrenDropTargetChange"
      @children-drop-target-leave="props.onChildrenDropTargetLeave"
      @drop-target-change="props.onDropTargetChange"
      @drop-target-leave="props.onDropTargetLeave"
      @drop-node="props.onDropNode"
      @edit-component="props.onEditComponent"
      @expand-slot-on-drag="props.onExpandSlotOnDrag"
    />
  </div>

  <div
    v-else-if="
      props.currentItemType === 'page' ||
      props.currentItemType === 'component' ||
      props.currentPageNodes.length > 0
    "
  >
    <LayerSlotGroup
      :slot-name="props.currentVirtualSlot"
      :slot-label="props.currentItemType === 'page' ? 'Content' : 'Component'"
      :nodes="props.getNodesInSlot(props.currentVirtualSlot)"
      :is-expanded="props.isExpanded(props.currentVirtualSlot)"
      :selected-node-id="props.selectedNodeId"
      :selected-node-ids="props.selectedNodeIds"
      :selected-node-path="props.selectedNodePath"
      :hovered-node-id="props.hoveredNodeId"
      :editing-node-id="props.editingNodeId"
      :draggable-key="props.draggableKey"
      :is-dragging="props.isDragging"
      :is-active-drag-list="
        props.activeDragListId === `slot:${props.currentVirtualSlot}`
      "
      :active-drag-list-id="props.activeDragListId"
      :drop-target-id="props.dropTargetId"
      :drop-target-position="props.dropTargetPosition"
      :node-actions="props.nodeActions"
      :show-empty-hint="true"
      empty-hint-text="Drop elements here"
      add-button-title="Add Element"
      icon-class="mr-2"
      :icon-style="{ color: 'var(--primary)' }"
      :force-min-height="true"
      :is-active-slot="props.activeSlotName === props.currentVirtualSlot"
      :is-node-expanded="props.isExpanded"
      :has-children="props.hasChildren"
      :can-accept-children="props.canAcceptChildren"
      :get-collapse-state="props.getCollapseState"
      :get-drop-indicator-class="props.getDropIndicatorClass"
      :visible-node-ids="props.visibleNodeIds"
      :render-cache-key="
        props.getSlotRenderCacheKey?.(
          props.currentVirtualSlot,
          props.getNodesInSlot(props.currentVirtualSlot),
        ) ?? props.renderCacheKey
      "
      @toggle-expand="props.onToggleExpand"
      @activate-slot="props.onActivateSlot"
      @open-picker="props.onOpenPicker"
      @drag-start="props.onDragStart"
      @drag-end="props.onDragEnd"
      @slot-change="props.onSlotChange"
      @select-node="props.onSelectNode"
      @hover-node="props.onHoverNode"
      @leave-node="props.onLeaveNode"
      @toggle-node-expand="props.onToggleExpand"
      @update-children="props.onUpdateChildren"
      @rename-node="props.onRenameNode"
      @edit-start="props.onEditStart"
      @edit-cancel="props.onEditCancel"
      @slot-drop-target-change="props.onSlotDropTargetChange"
      @slot-drop-target-leave="props.onSlotDropTargetLeave"
      @children-drop-target-change="props.onChildrenDropTargetChange"
      @children-drop-target-leave="props.onChildrenDropTargetLeave"
      @drop-target-change="props.onDropTargetChange"
      @drop-target-leave="props.onDropTargetLeave"
      @drop-node="props.onDropNode"
      @edit-component="props.onEditComponent"
      @expand-slot-on-drag="props.onExpandSlotOnDrag"
    />
  </div>
</template>
