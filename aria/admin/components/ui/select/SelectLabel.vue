<script setup lang="ts">
import { type HTMLAttributes } from "vue";
import { SelectLabel, type SelectLabelProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  SelectLabelProps & { class?: HTMLAttributes["class"] }
>();
</script>

<template>
  <SelectLabel
    :class="cn('block w-full px-3 py-1.5 text-left font-semibold', props.class)"
  >
    <slot />
  </SelectLabel>
</template>
