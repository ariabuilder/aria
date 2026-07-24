<script setup lang="ts">
import { computed } from "vue";

import ClassCssEditorDialog from "../components/ClassCssEditorDialog.vue";
import { buildClassSelectorPreview } from "../lib/classManagerCss";

interface BreakpointOption {
  id: string;
  label: string;
  icon?: string;
}

const props = defineProps<{
  open: boolean;
  className: string;
  breakpoints: BreakpointOption[];
  initialCss: string;
  initialBreakpoint: string;
  isSaving?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  submit: [payload: { cssText: string; breakpoint: string }];
}>();

const selectorPreview = computed(() =>
  buildClassSelectorPreview(props.className, "default"),
);
</script>

<template>
  <ClassCssEditorDialog
    :open="open"
    :class-name="className"
    :selector-preview="selectorPreview"
    :breakpoints="breakpoints"
    :initial-css="initialCss"
    :initial-breakpoint="initialBreakpoint"
    :is-saving="isSaving"
    @update:open="emit('update:open', $event)"
    @submit="emit('submit', $event)"
  />
</template>
