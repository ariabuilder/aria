<script setup lang="ts">
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    title?: string;
    framed?: boolean;
  }>(),
  { framed: false },
);
</script>

<template>
  <aside
    data-studio-organizer-rail
    :class="
      cn(
        'flex h-full min-h-0 w-70 shrink-0 flex-col overflow-hidden bg-background',
        props.framed
          ? 'rounded-md border border-solid border-border'
          : 'border-r border-dashed border-border border-l-0',
      )
    "
  >
    <div
      v-if="props.title"
      class="flex h-[4.75rem] shrink-0 items-center border-b border-dashed border-border bg-background px-5"
    >
      <div class="min-w-0">
        <h2 class="truncate text-2xl font-serif font-medium tracking-tight">
          {{ props.title }}
        </h2>
      </div>
    </div>
    <slot />
  </aside>
</template>
