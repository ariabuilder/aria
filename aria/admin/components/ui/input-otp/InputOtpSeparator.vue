<script setup lang="ts">
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: string;
}>();
</script>

<template>
  <div :class="cn('flex items-center', props.class)" role="separator">
    <slot>
      <div class="h-px w-3 bg-border" />
    </slot>
  </div>
</template>
