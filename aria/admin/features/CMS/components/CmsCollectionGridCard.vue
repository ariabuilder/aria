<script setup lang="ts">
import { computed } from "vue";
import type { CollectionSummary } from "../composables/useCollectionsList";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import CmsCollectionIconPreview from "./CmsCollectionIconPreview.vue";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  collection: CollectionSummary;
  iconClass: string;
}>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  open: [name: string];
}>();

const updatedLabel = computed(() => formatRelativeTime(props.collection.updatedAt));

const kindDotColor = computed((): string => {
  switch (props.collection.kind) {
    case "content":
      return "var(--published)";
    case "data":
      return "var(--primary)";
    case "config":
      return "var(--draft)";
    case "tags":
      return "var(--modified)";
    default:
      return "var(--muted-foreground)";
  }
});

const itemCountLabel = computed(() => {
  const count = props.collection.itemCount;
  return count === 1
    ? t("collections.oneEntry")
    : t("collections.entryCount", { count });
});
</script>

<template>
  <article
    class="group cursor-pointer overflow-hidden rounded-lg border border-solid border-border/50 bg-card/80 shadow-xs transition-[border-color,box-shadow,background-color] duration-150 ease-out hover:border-border hover:shadow-md"
    tabindex="0"
    @click="emit('open', collection.name)"
    @keydown.enter.prevent="emit('open', collection.name)"
    @keydown.space.prevent="emit('open', collection.name)"
  >
    <div class="relative aspect-video overflow-hidden bg-muted/25">
      <div class="absolute inset-0 flex items-center justify-center">
        <CmsCollectionIconPreview
          :value="iconClass"
          class="size-12 shrink-0 text-muted-foreground"
        />
      </div>

      <div
        class="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-md border border-border/50 bg-background/90 px-2 py-0.5 backdrop-blur-sm"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          :style="{ backgroundColor: kindDotColor }"
          aria-hidden="true"
        />
        <span class="text-2xs capitalize text-muted-foreground">
          {{ collection.kind }}
        </span>
      </div>
    </div>

    <div class="space-y-2 p-3.5">
      <h2 class="m-0 min-w-0 truncate text-sm font-medium text-foreground">
        {{ collection.label }}
      </h2>

      <div
        class="flex min-w-0 items-center justify-between gap-3 text-2xs text-muted-foreground"
      >
        <span
          class="truncate rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 tabular-nums"
        >
          {{ itemCountLabel }}
        </span>

        <span class="shrink-0 tabular-nums">
          {{ updatedLabel }}
        </span>
      </div>
    </div>
  </article>
</template>
