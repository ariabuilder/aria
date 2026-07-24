<script setup lang="ts">
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { studioIcons } from "@/lib/icons";
import type { CollectionSummary } from "../composables/useCollectionsList";
import { useStudioI18n } from "@/i18n";

defineProps<{
  collection: CollectionSummary;
}>();

const emit = defineEmits<{
  open: [];
  copyId: [];
}>();
const { t } = useStudioI18n();
</script>

<template>
  <ContextMenuContent class="w-44 p-1">
    <ContextMenuItem class="cursor-pointer gap-2 text-xs" @select="emit('open')">
      <span :class="[studioIcons.edit, 'size-3.5 text-muted-foreground']" />
      {{ t("collections.action.open") }}
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem
      class="cursor-pointer gap-2 text-xs"
      @select="emit('copyId')"
    >
      <span :class="[studioIcons.copy, 'size-3.5 text-muted-foreground']" />
      {{ t("collections.action.copyId") }}
    </ContextMenuItem>
  </ContextMenuContent>
</template>
