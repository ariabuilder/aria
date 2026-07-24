<script setup lang="ts">
import { computed } from "vue";
import ComponentPreviewCard from "@/features/Studio/components/components/ComponentPreviewCard.vue";
import type { ComposerLibraryComponent } from "../composables/useComposerComponentLibrary";

const props = defineProps<{
  open: boolean;
  anchorRect: DOMRect | null;
  groupLabel: string;
  components: readonly ComposerLibraryComponent[];
}>();

const emit = defineEmits<{
  close: [];
  insert: [componentId: string];
  dragstart: [componentId: string, event: DragEvent];
  dragend: [];
}>();

const FLYOUT_MAX_HEIGHT_PX = 32 * 16; // 32rem
const FLYOUT_VIEWPORT_PAD = 8;

const flyoutStyle = computed(() => {
  if (!props.anchorRect) {
    return {
      top: "0px",
      left: "0px",
      opacity: "0",
      pointerEvents: "none" as const,
    };
  }

  const maxHeight = Math.min(
    window.innerHeight * 0.7,
    FLYOUT_MAX_HEIGHT_PX,
  );
  const maxTop = Math.max(
    FLYOUT_VIEWPORT_PAD,
    window.innerHeight - maxHeight - FLYOUT_VIEWPORT_PAD,
  );
  const top = Math.min(
    Math.max(FLYOUT_VIEWPORT_PAD, props.anchorRect.top),
    maxTop,
  );
  const left = props.anchorRect.right + 8;

  return {
    top: `${top}px`,
    left: `${left}px`,
    maxHeight: `${maxHeight}px`,
  };
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="composer-component-flyout fixed z-50 w-80 overflow-x-hidden overflow-y-auto overscroll-contain rounded-sm border border-border/50 bg-background shadow-lg"
      :class="open ? 'composer-component-flyout-open' : ''"
      :style="flyoutStyle"
      @mouseleave="emit('close')"
    >
      <div
        class="sticky top-0 z-10 border-b border-dashed border-border bg-background px-3 py-2 font-serif text-sm text-muted-foreground"
      >
        {{ groupLabel }}
      </div>

      <div class="flex flex-col gap-2 p-1.5">
        <ComponentPreviewCard
          v-for="component in components"
          :key="component.id"
          variant="stack"
          :component-id="component.id"
          :name="component.name"
          :category="component.category"
          :thumbnail-url="component.thumbnailUrl"
          :snapshot-url="component.snapshotUrl"
          thumbnail-fit="cover"
          inert
          draggable
          @click="emit('insert', component.id)"
          @dragstart="emit('dragstart', component.id, $event)"
          @dragend="emit('dragend')"
        />

        <div
          v-if="components.length === 0"
          class="px-3 py-6 text-center text-xs text-muted-foreground"
        >
          No components in this group.
        </div>
      </div>
    </div>
  </Teleport>
</template>
