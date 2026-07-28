<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { useStageMarkupPreview } from "../composables/useStageMarkupPreview";

interface Props {
  variant?: "floating" | "toolbar";
}

const props = withDefaults(defineProps<Props>(), {
  variant: "toolbar",
});

const {
  isMarkupPreviewOpen,
  isMarkupPreviewDisabled,
  supportsHoverOpen,
  toggleMarkupPreview,
  openMarkupPreviewOnHover,
  scheduleMarkupPreviewCloseOnHoverLeave,
} = useStageMarkupPreview();

function handleTriggerClick(): void {
  if (supportsHoverOpen.value) {
    return;
  }

  toggleMarkupPreview();
}

const triggerButtonClass = computed(() => {
  if (props.variant === "toolbar") {
    return [
      "ml-0.5 rounded-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45",
      isMarkupPreviewOpen.value ? "bg-card text-primary" : "",
    ];
  }

  return "size-11 rounded-lg bg-sidebar/70 text-muted-foreground shadow-lg transition-colors duration-100 hover:bg-sidebar hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45";
});
</script>

<template>
  <Button
    type="button"
    variant="ghost"
    :size="props.variant === 'toolbar' ? 'icon-xs' : 'icon'"
    :class="triggerButtonClass"
    :disabled="isMarkupPreviewDisabled"
    :aria-label="isMarkupPreviewOpen ? 'Close markup preview' : 'Open markup preview'"
    :aria-pressed="isMarkupPreviewOpen"
    title="Markup Preview"
    @click.stop="handleTriggerClick"
    @mouseenter="openMarkupPreviewOnHover"
    @mouseleave="scheduleMarkupPreviewCloseOnHoverLeave"
    @pointerdown.stop
  >
    <span
      :class="[
        studioIcons.codeSquare,
        props.variant === 'toolbar' ? 'size-4 shrink-0' : 'size-4.5',
      ]"
      aria-hidden="true"
    />
  </Button>
</template>
