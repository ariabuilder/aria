<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  first?: boolean;
  /** Tighter gap before this section — for menus with fewer groups (e.g. entry detail). */
  compact?: boolean;
}>();
</script>

<template>
  <div
    role="presentation"
    :class="
      cn(
        'pointer-events-none select-none border-t border-dashed border-border px-3 pb-0.5 text-3xs font-semibold uppercase tracking-widest text-muted-foreground',
        props.first
          ? 'border-t-0 pt-2'
          : props.compact
            ? 'mt-0 pt-2'
            : 'mt-3 pt-1',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
