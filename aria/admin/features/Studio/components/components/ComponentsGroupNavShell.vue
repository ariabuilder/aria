<script setup lang="ts">
import type { ComponentGroup } from "@/lib/schemas/componentGrouping";
import { StudioGroupNavShell } from "@/features/Studio/core/components";

defineProps<{
  groups: readonly ComponentGroup[];
  groupCounts: Readonly<Record<string, number>>;
  allCount: number;
  activeFilter: string;
  canUpdateGrouping: boolean;
  enableDropTargets?: boolean;
  isDropTarget?: (targetId: string | null) => boolean;
}>();

const emit = defineEmits<{
  selectAll: [];
  selectGroup: [groupId: string];
  createGroup: [name: string];
  renameGroup: [groupId: string, name: string];
  deleteGroup: [groupId: string];
  navItemEnter: [key: string, anchorRect: DOMRect | null];
  dragOver: [targetId: string | null, event: DragEvent];
  dragLeave: [targetId: string | null];
  drop: [targetId: string | null, event: DragEvent];
}>();
</script>

<template>
  <StudioGroupNavShell
    :groups="groups"
    :group-counts="groupCounts"
    :all-count="allCount"
    :active-filter="activeFilter"
    :can-update-grouping="canUpdateGrouping"
    all-label="All Components"
    new-group-label="New group"
    delete-dialog-title="Delete group"
    delete-stay-available-message="Components stay available; only the group is removed."
    group-name-placeholder="Group name"
    nav-aria-label="Component groups"
    :enable-drop-targets="enableDropTargets"
    :is-drop-target="isDropTarget"
    @select-all="emit('selectAll')"
    @select-group="emit('selectGroup', $event)"
    @create-group="emit('createGroup', $event)"
    @rename-group="(id, name) => emit('renameGroup', id, name)"
    @delete-group="emit('deleteGroup', $event)"
    @nav-item-enter="(key, rect) => emit('navItemEnter', key, rect)"
    @drag-over="(id, event) => emit('dragOver', id, event)"
    @drag-leave="(id) => emit('dragLeave', id)"
    @drop="(id, event) => emit('drop', id, event)"
  />
</template>
