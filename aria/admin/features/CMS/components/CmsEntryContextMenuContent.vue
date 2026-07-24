<script setup lang="ts">
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { studioIcons } from "@/lib/icons";
import type { CmsEntryRow } from "../lib/entryRow";
import { useStudioI18n } from "@/i18n";

defineProps<{
  entry: CmsEntryRow;
}>();

const emit = defineEmits<{
  open: [];
  duplicate: [];
  publish: [];
  unpublish: [];
  archive: [];
  delete: [];
  copyId: [];
}>();
const { t } = useStudioI18n();
</script>

<template>
  <ContextMenuContent class="w-44 p-1">
    <ContextMenuItem class="cursor-pointer gap-2 text-xs" @select="emit('open')">
      <span :class="[studioIcons.edit, 'size-3.5 text-muted-foreground']" />
      {{ t("cms.entries.open") }}
    </ContextMenuItem>
    <ContextMenuItem
      class="cursor-pointer gap-2 text-xs"
      @select="emit('duplicate')"
    >
      <span :class="[studioIcons.duplicate, 'size-3.5 text-muted-foreground']" />
      {{ t("pages.action.duplicate") }}
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem
      v-if="entry.status !== 'published'"
      class="cursor-pointer gap-2 text-xs"
      @select="emit('publish')"
    >
      <span :class="[studioIcons.published, 'size-3.5 text-muted-foreground']" />
      {{ t("pages.action.publish") }}
    </ContextMenuItem>
    <ContextMenuItem
      v-if="entry.status === 'published'"
      class="cursor-pointer gap-2 text-xs"
      @select="emit('unpublish')"
    >
      <span :class="[studioIcons.unpublish, 'size-3.5 text-muted-foreground']" />
      {{ t("pages.action.unpublish") }}
    </ContextMenuItem>
    <ContextMenuItem
      v-if="entry.status !== 'archived'"
      class="cursor-pointer gap-2 text-xs"
      @select="emit('archive')"
    >
      <span :class="[studioIcons.archive, 'size-3.5 text-muted-foreground']" />
      {{ t("pages.action.archive") }}
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem
      class="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
      @select="emit('delete')"
    >
      <span :class="[studioIcons.trash, 'size-3.5']" />
      {{ t("common.delete") }}
    </ContextMenuItem>
    <ContextMenuItem
      class="cursor-pointer gap-2 text-xs"
      @select="emit('copyId')"
    >
      <span :class="[studioIcons.copy, 'size-3.5 text-muted-foreground']" />
      {{ t("cms.entries.copyId") }}
    </ContextMenuItem>
  </ContextMenuContent>
</template>
