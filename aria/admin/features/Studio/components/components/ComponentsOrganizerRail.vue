<script setup lang="ts">
import type { ComponentGroup } from "@/lib/schemas/componentGrouping";
import { StudioOrganizerRail } from "@/features/Studio/core/components";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  groups: readonly ComponentGroup[];
  groupCounts: Readonly<Record<string, number>>;
  allCount: number;
  activeFilter: string;
  canUpdateGrouping: boolean;
  onMoveToGroup: (
    componentId: string,
    groupId?: string,
  ) => void | Promise<void>;
  onMoveItemsToGroup?: (
    componentIds: string[],
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
const { t } = useStudioI18n();
</script>

<template>
  <StudioOrganizerRail
    :title="t('components.title')"
    framed
    :groups="groups"
    :group-counts="groupCounts"
    :all-count="allCount"
    :active-filter="activeFilter"
    :can-update-grouping="canUpdateGrouping"
    :all-label="t('components.sidebar.all')"
    :new-group-label="t('components.sidebar.newGroup')"
    :delete-dialog-title="t('components.sidebar.deleteGroup')"
    :delete-stay-available-message="t('components.sidebar.deleteDescription')"
    :group-name-placeholder="t('components.sidebar.groupName')"
    :nav-aria-label="t('components.sidebar.groups')"
    :on-move-to-group="onMoveToGroup"
    :on-move-items-to-group="onMoveItemsToGroup"
    @select-all="emit('selectAll')"
    @select-group="emit('selectGroup', $event)"
    @create-group="emit('createGroup', $event)"
    @rename-group="(id, name) => emit('renameGroup', id, name)"
    @delete-group="emit('deleteGroup', $event)"
  />
</template>
