<script setup lang="ts">
import { computed, type HTMLAttributes } from "vue";
import { SelectValue, type SelectValueProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<SelectValueProps & { class?: HTMLAttributes["class"] }>();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;
  return delegated;
});
</script>

<template>
  <span :class="cn('inline-flex flex-1 items-center', props.class)">
    <SelectValue v-bind="delegatedProps">
      <slot />
    </SelectValue>
  </span>
</template>
