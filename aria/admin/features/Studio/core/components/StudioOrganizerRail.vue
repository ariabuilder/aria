<script setup lang="ts">
import type { StudioGroup } from "./StudioGroupNavList.vue";
import {
  normalizeOrganizerDropTarget,
  parseOrganizerDragIds,
  resolveOrganizerDropTargetId,
  useStudioOrganizerDragState,
} from "@/features/Studio/core/composables/useStudioOrganizerDragState";
import { endOrganizerDragGhost } from "@/features/Studio/core/lib/organizerDragGhost";
import StudioGroupNavShell from "./StudioGroupNavShell.vue";
import StudioRailFrame from "./StudioRailFrame.vue";

const props = defineProps<{
  title?: string;
  framed?: boolean;
  groups: readonly StudioGroup[];
  groupCounts: Readonly<Record<string, number>>;
  allCount: number;
  activeFilter: string;
  canUpdateGrouping: boolean;
  allLabel: string;
  newGroupLabel: string;
  deleteDialogTitle: string;
  deleteStayAvailableMessage: string;
  groupNamePlaceholder?: string;
  navAriaLabel: string;
  onMoveToGroup: (itemId: string, groupId?: string) => void | Promise<void>;
  onMoveItemsToGroup?: (
    itemIds: string[],
    groupId?: string,
  ) => void | Promise<void>;
}>();

const emit = defineEmits<{
  selectAll: [];
  selectGroup: [groupId: string];
  createGroup: [name: string];
  renameGroup: [groupId: string, name: string];
  deleteGroup: [groupId: string];
}>();

const dragState = useStudioOrganizerDragState();

function isDropTarget(targetId: string | null): boolean {
  if (targetId === null || targetId === "__all__") {
    return dragState.dragTargetGroupId.value === "__all__";
  }
  return dragState.dragTargetGroupId.value === targetId;
}

function handleDragOver(targetId: string | null, event: DragEvent): void {
  if (!props.canUpdateGrouping) {
    return;
  }
  allowDrop(event);
  dragState.setDropTarget(targetId === null ? "__all__" : targetId);
}

function handleDragLeave(targetId: string | null): void {
  const id = targetId === null ? "__all__" : targetId;
  dragState.clearDropTarget(id);
}

function allowDrop(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function handleRailDragOver(event: DragEvent): void {
  if (!props.canUpdateGrouping) {
    return;
  }

  allowDrop(event);

  const target = resolveOrganizerDropTargetId(event);
  if (target) {
    dragState.setDropTarget(target);
  }
}

async function handleDrop(
  targetId: string | null,
  event: DragEvent,
): Promise<void> {
  if (!props.canUpdateGrouping || dragState.wasOrganizerDropCommitted()) {
    return;
  }
  allowDrop(event);
  const itemIds = parseOrganizerDragIds(event);
  if (itemIds.length === 0) {
    return;
  }

  dragState.markOrganizerDropCommitted();
  // Tear down the body-level ghost before any await/DOM mutation so a skipped
  // dragend (common when the drag source remounts) cannot leave it stuck.
  endOrganizerDragGhost();
  dragState.endDrag();

  if (props.onMoveItemsToGroup) {
    await props.onMoveItemsToGroup(itemIds, targetId ?? undefined);
  } else {
    await props.onMoveToGroup(itemIds[0]!, targetId ?? undefined);
  }
}

async function handleRailDrop(event: DragEvent): Promise<void> {
  if (!props.canUpdateGrouping) {
    return;
  }

  const target = normalizeOrganizerDropTarget(
    resolveOrganizerDropTargetId(event) ?? dragState.dragTargetGroupId.value,
  );

  await handleDrop(target, event);
}
</script>

<template>
  <StudioRailFrame
    :title="props.title"
    :framed="props.framed"
    @dragover="handleRailDragOver"
    @drop="handleRailDrop"
  >
    <StudioGroupNavShell
      :groups="groups"
      :group-counts="groupCounts"
      :all-count="allCount"
      :active-filter="activeFilter"
      :can-update-grouping="canUpdateGrouping"
      :all-label="allLabel"
      :new-group-label="newGroupLabel"
      :delete-dialog-title="deleteDialogTitle"
      :delete-stay-available-message="deleteStayAvailableMessage"
      :group-name-placeholder="groupNamePlaceholder"
      :nav-aria-label="navAriaLabel"
      :enable-drop-targets="canUpdateGrouping"
      :is-drop-target="isDropTarget"
      @select-all="emit('selectAll')"
      @select-group="emit('selectGroup', $event)"
      @create-group="emit('createGroup', $event)"
      @rename-group="(id, name) => emit('renameGroup', id, name)"
      @delete-group="emit('deleteGroup', $event)"
      @drag-over="handleDragOver"
      @drag-leave="handleDragLeave"
      @drop="handleDrop"
    />
  </StudioRailFrame>
</template>
