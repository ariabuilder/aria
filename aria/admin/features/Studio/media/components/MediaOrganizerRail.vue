<script setup lang="ts">
import type { MediaGroup } from "@/lib/schemas/mediaGrouping";
import { StudioOrganizerRail } from "@/features/Studio/core/components";
import { useStudioI18n } from "@/i18n";

defineProps<{
  groups: readonly MediaGroup[];
  groupCounts: Readonly<Record<string, number>>;
  allCount: number;
  activeFilter: string;
  canUpdateGrouping: boolean;
  onMoveToGroup: (assetId: string, groupId?: string) => void | Promise<void>;
  onMoveItemsToGroup?: (
    assetIds: string[],
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
    :title="t('media.sidebar.title')"
    framed
    :groups="groups"
    :group-counts="groupCounts"
    :all-count="allCount"
    :active-filter="activeFilter"
    :can-update-grouping="canUpdateGrouping"
    :all-label="t('media.sidebar.all')"
    :new-group-label="t('media.sidebar.newFolder')"
    :delete-dialog-title="t('media.sidebar.deleteFolder')"
    :delete-stay-available-message="t('media.sidebar.deleteDescription')"
    :group-name-placeholder="t('media.sidebar.folderName')"
    :nav-aria-label="t('media.sidebar.folders')"
    :on-move-to-group="onMoveToGroup"
    :on-move-items-to-group="onMoveItemsToGroup"
    @select-all="emit('selectAll')"
    @select-group="emit('selectGroup', $event)"
    @create-group="emit('createGroup', $event)"
    @rename-group="(id, name) => emit('renameGroup', id, name)"
    @delete-group="emit('deleteGroup', $event)"
  />
</template>
