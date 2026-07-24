<script setup lang="ts">
// @ts-ignore - vue-resizable-panels types issue
import { PanelGroup } from "vue-resizable-panels";
import type { PanelGroupProps } from "vue-resizable-panels";
import { cn } from "@/components/ui/utils";

interface Props extends /* @vue-ignore */ PanelGroupProps {
  class?: string;
}

const props = defineProps<Props>();
</script>

<template>
  <PanelGroup
    v-bind="props"
    :class="
      cn(
        'flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
        props.class,
      )
    "
  >
    <slot />
  </PanelGroup>
</template>
