<script setup lang="ts">
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import type { Component } from "@/composables/useBuilderData";
import type { ComponentGroup } from "@/lib/schemas/componentGrouping";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

defineProps<{
  component: Component;
  canEditInComposer: boolean;
  canUpdateGrouping?: boolean;
  customGroups?: readonly ComponentGroup[];
  currentGroupId?: string | null;
}>();

const emit = defineEmits<{
  open: [];
  editInComposer: [];
  rename: [];
  duplicate: [];
  delete: [];
  moveToGroup: [groupId?: string];
}>();
const { t } = useStudioI18n();
</script>

<template>
  <ContextMenuContent class="w-52">
    <ContextMenuItem @click="emit('open')">
      <span :class="[studioIcons.eye, 'mr-2 size-4']" />
      {{ t("components.action.open") }}
    </ContextMenuItem>
    <ContextMenuItem :disabled="!canEditInComposer" @click="emit('editInComposer')">
      <span :class="[studioIcons.edit, 'mr-2 size-4']" />
      {{ t("pages.action.editInComposer") }}
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem @click="emit('rename')">
      <span :class="[studioIcons.edit03, 'mr-2 size-4']" />
      {{ t("pages.action.rename") }}
    </ContextMenuItem>
    <ContextMenuItem @click="emit('duplicate')">
      <span :class="[studioIcons.duplicate, 'mr-2 size-4']" />
      {{ t("pages.action.duplicate") }}
    </ContextMenuItem>
    <ContextMenuSub v-if="canUpdateGrouping">
      <ContextMenuSubTrigger>
        <span :class="[studioIcons.folder, 'mr-2 size-4']" />
        {{ t("components.action.moveToGroup") }}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent class="max-h-64 w-48 overflow-y-auto">
        <ContextMenuItem
          :disabled="!currentGroupId"
          @click="emit('moveToGroup')"
        >
          {{ t("components.sidebar.all") }}
        </ContextMenuItem>
        <ContextMenuSeparator v-if="(customGroups?.length ?? 0) > 0" />
        <ContextMenuItem
          v-for="group in customGroups ?? []"
          :key="group.id"
          :disabled="currentGroupId === group.id"
          @click="emit('moveToGroup', group.id)"
        >
          {{ group.name }}
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
    <ContextMenuSeparator />
    <ContextMenuItem class="text-destructive focus:text-destructive" @click="emit('delete')">
      <span :class="[studioIcons.trash, 'mr-2 size-4']" />
      {{ t("common.delete") }}
    </ContextMenuItem>
  </ContextMenuContent>
</template>
