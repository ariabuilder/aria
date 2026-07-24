<script setup lang="ts">
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    bg?: "background" | "sidebar";
    class?: string;
  }>(),
  {
    bg: "background",
  },
);
</script>

<template>
  <div
    data-testid="composer-panel"
    :class="
      cn(
        'flex min-h-0 flex-col overflow-hidden rounded-md border-solid border-border! border',
        props.bg === 'background' ? 'bg-background' : 'bg-sidebar',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
