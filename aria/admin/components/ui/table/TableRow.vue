<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <tr
    data-slot="table-row"
    v-bind="$attrs"
    :class="
      cn(
        'hover:bg-muted/50 data-[state=selected]:bg-muted border-b border-border transition-colors cursor-pointer',
        props.class,
      )
    "
  >
    <slot />
  </tr>
</template>
