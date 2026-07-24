<script setup lang="ts">
import { computed } from "vue";
import type { SelectableComponent } from "@/features/Core";
import ComponentThumbnailPreview from "@/features/Studio/components/components/ComponentThumbnailPreview.vue";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import { getSelectableComponentId } from "./componentPickerModel";

const props = defineProps<{
  component: SelectableComponent;
}>();

const emit = defineEmits<{
  select: [component: SelectableComponent];
}>();

const { t } = useStudioI18n();
const componentId = computed(() => getSelectableComponentId(props.component));
</script>

<template>
  <button
    type="button"
    class="flex min-w-0 flex-col overflow-hidden rounded-sm border border-border/50 bg-card text-left shadow-none transition-[border-color,box-shadow] duration-150 ease-out hover:border-border hover:shadow-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
    :aria-label="t('components.picker.insert', { name: component.name })"
    @click="emit('select', component)"
  >
    <div
      class="pointer-events-none relative aspect-16/10 w-full overflow-hidden border-b border-dashed border-border/50 bg-muted/20"
    >
      <ComponentThumbnailPreview
        v-if="componentId"
        :component-id="componentId"
        :thumbnail-url="component.thumbnailUrl"
        :snapshot-url="component.snapshotUrl"
        :updated-at="component.updatedAt"
        thumbnail-fit="contain"
      />
      <div
        v-else
        class="flex h-full w-full items-center justify-center text-muted-foreground/50"
      >
        <span :class="[studioIcons.component, 'size-5']" aria-hidden="true" />
      </div>
    </div>

    <div class="flex min-h-18 w-full min-w-0 flex-col gap-1.5 px-3 py-2.5">
      <div class="flex min-w-0 items-center justify-between gap-2">
        <span class="truncate font-serif text-sm font-medium text-foreground">
          {{ component.name }}
        </span>
        <span
          v-if="component.source === 'aria'"
          class="shrink-0 text-3xs font-medium uppercase tracking-wide text-primary/80"
        >
          Aria
        </span>
      </div>

      <p class="line-clamp-1 text-xs leading-4 text-muted-foreground">
        {{ component.description || t("components.picker.noDescription") }}
      </p>
    </div>
  </button>
</template>
