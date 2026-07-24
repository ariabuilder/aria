<script setup lang="ts">
import type { TooltipProviderProps } from "reka-ui";
import { TooltipProvider, useForwardProps } from "reka-ui";

const props = withDefaults(defineProps<TooltipProviderProps>(), {
  delayDuration: 400,
  skipDelayDuration: 150,
  disableHoverableContent: true,
});

const forwarded = useForwardProps(props);
</script>

<template>
  <TooltipProvider data-slot="tooltip-provider" v-bind="forwarded">
    <slot />
  </TooltipProvider>
</template>
