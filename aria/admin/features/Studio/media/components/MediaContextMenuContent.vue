<script setup lang="ts">
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import type { MediaGroup } from "@/lib/schemas/mediaGrouping";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

defineProps<{
  canDelete?: boolean;
  canUpdateGrouping?: boolean;
  customGroups?: readonly MediaGroup[];
  currentGroupId?: string | null;
}>();

const emit = defineEmits<{
  preview: [];
  copyUrl: [];
  rename: [];
  duplicate: [];
  delete: [];
  moveToGroup: [groupId?: string];
}>();
const { t } = useStudioI18n();
</script>

<template>
  <ContextMenuContent class="w-52">
    <ContextMenuItem @click="emit('preview')">
      <span :class="[studioIcons.eye, 'mr-2 size-4']" />
      {{ t("media.preview") }}
    </ContextMenuItem>
    <ContextMenuItem @click="emit('copyUrl')">
      <span :class="[studioIcons.link, 'mr-2 size-4']" />
      {{ t("media.copyUrl") }}
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem @click="emit('rename')">
      <span :class="[studioIcons.edit03, 'mr-2 size-4']" />
      {{ t("media.rename") }}
    </ContextMenuItem>
    <ContextMenuItem @click="emit('duplicate')">
      <span :class="[studioIcons.duplicate, 'mr-2 size-4']" />
      {{ t("media.duplicate") }}
    </ContextMenuItem>
    <ContextMenuSub v-if="canUpdateGrouping">
      <ContextMenuSubTrigger>
        <span :class="[studioIcons.folder, 'mr-2 size-4']" />
        {{ t("media.moveToFolder") }}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent class="max-h-64 w-48 overflow-y-auto">
        <ContextMenuItem
          :disabled="!currentGroupId"
          @click="emit('moveToGroup')"
        >
          {{ t("media.all") }}
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
    <template v-if="canDelete !== false">
      <ContextMenuSeparator />
      <ContextMenuItem
        class="text-destructive focus:text-destructive"
        @click="emit('delete')"
      >
        <span :class="[studioIcons.trash, 'mr-2 size-4']" />
        {{ t("common.delete") }}
      </ContextMenuItem>
    </template>
  </ContextMenuContent>
</template>
