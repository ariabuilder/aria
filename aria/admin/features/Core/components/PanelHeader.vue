<script setup lang="ts">
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: string;
  testId?: string;
}>();
</script>

<template>
  <div
    :data-testid="props.testId"
    :class="
      cn(
        'h-10 border-b flex items-center gap-1 border-border border-dashed min-w-0 pl-3 pr-1.5 bg-input shrink-0',
        props.class,
      )
    "
  >
    <div class="flex items-center min-w-0 flex-1 gap-1.5">
      <slot />
    </div>
    <slot name="trailing" />
  </div>
</template>
