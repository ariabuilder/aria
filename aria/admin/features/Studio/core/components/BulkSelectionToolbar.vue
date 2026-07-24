<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";

const { t } = useStudioI18n();

const props = withDefaults(
  defineProps<{
    count: number;
    entityLabel: string;
    showDuplicate?: boolean;
    showDelete?: boolean;
  }>(),
  {
    showDuplicate: true,
    showDelete: true,
  },
);

const emit = defineEmits<{
  duplicate: [];
  delete: [];
}>();

function pluralSuffix(count: number): string {
  return count === 1 ? "" : "s";
}
</script>

<template>
  <div class="flex items-center gap-2 whitespace-nowrap">
    <span
      class="text-xs text-muted-foreground tabular-nums select-none pr-3"
    >
      {{ t("common.selectionCount", {
        count: props.count,
        entity: `${props.entityLabel}${pluralSuffix(props.count)}`,
      }) }}
    </span>
    <slot name="actions" />
    <Button
      v-if="props.showDuplicate"
      variant="outline"
      size="sm"
      class="h-9 text-muted-foreground hover:text-foreground!"
      @click="emit('duplicate')"
    >
      <span :class="[studioIcons.duplicate, 'mr-1.5 size-3']" />
      {{ t("common.duplicate") }}
    </Button>
    <Button
      v-if="props.showDelete"
      variant="outline"
      size="sm"
      class="h-9 text-muted-foreground hover:text-destructive! hover:border-destructive!"
      @click="emit('delete')"
    >
      <span :class="[studioIcons.trash, 'mr-1.5 size-3']" />
      {{ t("common.delete") }}
    </Button>
  </div>
</template>
