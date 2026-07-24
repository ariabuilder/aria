<script setup lang="ts">
// @ts-ignore - vue-resizable-panels types issue
import { PanelResizeHandle } from "vue-resizable-panels";
import { cn } from "@/components/ui/utils";

interface Props {
  withHandle?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  withHandle: true,
});
</script>

<template>
  <PanelResizeHandle
    :class="
      cn(
        'group/handle relative flex w-px items-center justify-center bg-border',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'focus-visible:ring-offset-1',
        'data-[panel-group-direction=vertical]:h-px',
        'data-[panel-group-direction=vertical]:w-full',
        'data-[panel-group-direction=vertical]:after:left-0',
        'data-[panel-group-direction=vertical]:after:h-1',
        'data-[panel-group-direction=vertical]:after:w-full',
        'data-[panel-group-direction=vertical]:after:-translate-y-1/2',
        'data-[panel-group-direction=vertical]:after:translate-x-0',
        'data-resize-handle-active:bg-primary',
        // State-of-the-art smoothness
        'transition-colors duration-100 ease-out',
        'hover:bg-primary active:bg-primary',
        // GPU acceleration
        'will-change-[background-color]',
        props.class,
      )
    "
  >
    <div
      v-if="withHandle"
      :class="
        cn(
          // Container
          'z-10 flex items-center justify-center',
          'h-10 w-10 rounded-md',
          // Horizontal split (left/right panels) → vertical dots
          'flex-col',
          // Vertical split (top/bottom panels) → horizontal dots
          'group-data-[panel-group-direction=vertical]/handle:h-1 group-data-[panel-group-direction=vertical]/handle:w-10',
          'group-data-[panel-group-direction=vertical]/handle:flex-row',
          'bg-background',
          'border border-border border-dashed group-hover:border-primary',
          // Smooth interactions - mechanical feel
          'transition-all duration-100 ease-out',
          'group-hover/handle:bg-background group-hover/handle:border-primary',
          'group-hover/handle:scale-y-110',
          'group-data-[panel-group-direction=vertical]/handle:group-hover/handle:scale-x-110 group-data-[panel-group-direction=vertical]/handle:group-hover/handle:scale-y-100',
        )
      "
    >
      <!-- Dot indicator -->
      <div
        :class="
          cn(
            'flex items-center justify-center gap-0.75',
            'flex-col',
            'group-data-[panel-group-direction=vertical]/handle:flex-row',
          )
        "
      >
        <div
          class="h-1 w-1 rounded-md bg-border transition-colors duration-100 group-hover/handle:bg-primary"
        />
      </div>
    </div>

    <!-- Active state indicator (appears on drag) -->
    <div
      :class="
        cn(
          'absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5',
          'bg-primary opacity-0 transition-opacity duration-150',
          'group-data-resize-handle-active/handle:opacity-100',
          'group-data-[panel-group-direction=vertical]/handle:inset-x-0 group-data-[panel-group-direction=vertical]/handle:top-1/2 group-data-[panel-group-direction=vertical]/handle:-translate-y-1/2 group-data-[panel-group-direction=vertical]/handle:h-0.5 group-data-[panel-group-direction=vertical]/handle:w-full group-data-[panel-group-direction=vertical]/handle:translate-x-0',
        )
      "
    />
  </PanelResizeHandle>
</template>
