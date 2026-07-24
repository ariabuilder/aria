<script setup lang="ts">
import { ref } from "vue";
// @ts-ignore - vue-resizable-panels types issue
import { Panel } from "vue-resizable-panels";
import type { PanelProps, ImperativePanelHandle } from "vue-resizable-panels";
import { cn } from "@/components/ui/utils";

interface Props extends /* @vue-ignore */ PanelProps {
  class?: string;
}

const props = defineProps<Props>();

const panelRef = ref<ImperativePanelHandle>();

function collapse(): void {
  panelRef.value?.collapse();
}

function expand(): void {
  panelRef.value?.expand();
}

function getCollapsed(): boolean {
  return panelRef.value?.getCollapsed() ?? false;
}

function getSize(): number {
  return panelRef.value?.getSize() ?? 0;
}

function resize(size: number): void {
  panelRef.value?.resize(size);
}

defineExpose({
  collapse,
  expand,
  getCollapsed,
  getSize,
  resize,
});
</script>

<template>
  <Panel ref="panelRef" v-bind="props" :class="cn('', props.class)">
    <slot />
  </Panel>
</template>
