<script setup lang="ts">
import { computed, ref } from "vue";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PreviewViewportPreset } from "@/features/Studio/pages/composables/previewViewportPresets";
import ComponentIsolatePreview from "./ComponentIsolatePreview.vue";
import ComponentThumbnailPreview from "./ComponentThumbnailPreview.vue";

export type ComponentPreviewCardVariant = "sm" | "md" | "lg" | "stack";

const props = withDefaults(
  defineProps<{
    componentId: string;
    name: string;
    category?: string;
    variant?: ComponentPreviewCardVariant;
    thumbnailUrl?: string | null;
    snapshotUrl?: string | null;
    thumbnailRefreshToken?: string | null;
    snapshotRefreshToken?: string | null;
    inert?: boolean;
    eager?: boolean;
    viewport?: PreviewViewportPreset;
    draggable?: boolean;
    fillPreview?: boolean;
    showMeta?: boolean;
    thumbnailFit?: "contain" | "cover";
  }>(),
  {
    variant: "md",
    viewport: "desktop",
    category: undefined,
    thumbnailUrl: null,
    snapshotUrl: null,
    thumbnailRefreshToken: null,
    snapshotRefreshToken: null,
    inert: false,
    eager: false,
    draggable: false,
    fillPreview: false,
    showMeta: true,
    thumbnailFit: "contain",
  },
);

const emit = defineEmits<{
  click: [];
  dragstart: [event: DragEvent];
  dragend: [];
}>();

const didDrag = ref(false);

const isStacked = computed(
  () => props.variant === "lg" || props.variant === "stack",
);

const wellClass = computed(() => {
  if (props.fillPreview) {
    return "h-full min-h-0 w-full flex-1";
  }

  switch (props.variant) {
    case "sm":
      return "h-14 w-20 shrink-0 aspect-10/7";
    case "md":
      return "h-[4.25rem] w-24 shrink-0 aspect-12/8.5";
    case "stack":
      return "h-28 w-full shrink-0";
    case "lg":
      return "min-h-48 w-full aspect-16/10";
    default:
      return "h-[4.25rem] w-24 shrink-0";
  }
});

const rowClass = computed(() => {
  if (props.fillPreview) {
    return "flex h-full min-h-0 flex-col";
  }

  if (isStacked.value) {
    return props.variant === "stack"
      ? "flex flex-col gap-2"
      : "flex h-full flex-col gap-3";
  }
  return "flex min-h-16 items-center gap-3";
});

function handleDragStart(event: DragEvent): void {
  didDrag.value = true;
  emit("dragstart", event);
}

function handleDragEnd(): void {
  emit("dragend");
  // Allow the synthetic post-drag click to be ignored, then clear.
  requestAnimationFrame(() => {
    didDrag.value = false;
  });
}

function handleActivate(): void {
  if (didDrag.value) {
    return;
  }
  emit("click");
}
</script>

<template>
  <article
    :class="
      cn(
        'rounded-sm border border-border/50 bg-card text-left transition-colors hover:border-dashed hover:bg-muted/30',
        fillPreview
          ? 'h-full min-h-0 p-0'
          : variant === 'lg'
            ? 'p-3'
            : variant === 'stack'
              ? 'p-2'
              : 'px-2.5 py-2',
        draggable ? 'cursor-grab active:cursor-grabbing' : '',
      )
    "
    :draggable="draggable"
    @click="draggable ? handleActivate() : undefined"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <div :class="rowClass">
      <!--
        When draggable, avoid nested <button> so HTML5 drag can start from the
        preview (browsers block drag initiation from button children).
      -->
      <component
        :is="draggable ? 'div' : 'button'"
        :type="draggable ? undefined : 'button'"
        :class="
          cn(
            'group/preview shrink-0 text-left',
            isStacked ? 'w-full' : '',
            fillPreview ? 'h-full min-h-0 flex-1' : '',
          )
        "
        @click="draggable ? undefined : emit('click')"
      >
        <div
          :class="
            cn(
              'overflow-hidden rounded-sm border border-border/50 bg-background',
              wellClass,
            )
          "
        >
          <ComponentThumbnailPreview
            v-if="inert"
            :component-id="componentId"
            :thumbnail-url="thumbnailUrl"
            :thumbnail-refresh-token="thumbnailRefreshToken"
            :eager="eager"
            :thumbnail-fit="thumbnailFit"
          />
          <ComponentIsolatePreview
            v-else
            :component-id="componentId"
            :eager="eager"
            :viewport="viewport"
            :snapshot-url="snapshotUrl"
            :snapshot-refresh-token="snapshotRefreshToken"
          />
        </div>
      </component>

      <div
        v-if="showMeta"
        :class="isStacked ? 'min-w-0' : 'min-w-0 flex-1'"
      >
        <component
          :is="draggable ? 'div' : 'button'"
          :type="draggable ? undefined : 'button'"
          class="w-full text-left"
          @click="draggable ? undefined : emit('click')"
        >
          <div class="truncate font-serif text-sm font-medium text-muted-foreground">
            {{ name }}
          </div>
          <Badge
            v-if="category"
            variant="outline"
            class="mt-1 text-2xs"
          >
            {{ category }}
          </Badge>
        </component>
      </div>
    </div>
  </article>
</template>
