<script setup lang="ts">
/**
 * Shared grid/list presentation for block library elements.
 */

const props = defineProps<{
  icon: string;
  label: string;
  viewMode?: "grid" | "list";
}>();

const slots = defineSlots<{
  preview?: () => unknown;
}>();
</script>

<template>
  <!-- List mode: compact single-line -->
  <div
    v-if="(props.viewMode || 'grid') === 'list'"
    class="group flex items-center gap-2 px-2 py-1.5 bg-card/30 border border-border rounded-md hover:bg-card/70 transition-all duration-100"
  >
    <span
      aria-hidden="true"
      :class="[
        props.icon,
        'size-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0',
      ]"
    />
    <span
      class="text-xs text-muted-foreground group-hover:text-foreground transition-colors"
    >
      {{ props.label }}
    </span>
  </div>

  <!-- Grid mode: icon top, text bottom -->
  <div
    v-else
    class="flex flex-col items-center justify-center gap-2 p-4 rounded-md border bg-card/50 border-border border-dashed hover:border-primary/50 hover:bg-primary/5 cursor-pointer group transition-all"
  >
    <!-- Custom preview slot (for components with thumbnails) -->
    <slot name="preview">
      <!-- Default: just icon -->
      <span
        aria-hidden="true"
        :class="[
          props.icon,
          'size-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0',
        ]"
      />
    </slot>

    <span
      class="text-xs text-muted-foreground group-hover:text-foreground transition-colors"
    >
      {{ props.label }}
    </span>
  </div>
</template>
