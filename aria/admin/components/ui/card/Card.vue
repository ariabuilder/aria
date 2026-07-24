<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <div
    data-slot="card"
    :class="
      cn(
        'bg-sidebar text-foreground flex flex-col gap-2 rounded-md border border-border border-solid',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
