<script setup lang="ts">
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

withDefaults(
  defineProps<{
    label: string;
    side?: "top" | "bottom" | "left" | "right";
  }>(),
  {
    side: "bottom",
  },
);
</script>

<template>
  <TooltipProvider
    :delay-duration="0"
    :skip-delay-duration="0"
    :disable-hoverable-content="true"
  >
    <span class="inline-flex shrink-0">
      <Tooltip :disable-closing-trigger="true">
        <TooltipTrigger as-child>
          <span class="inline-flex shrink-0 outline-none" tabindex="-1">
            <slot />
          </span>
        </TooltipTrigger>
        <TooltipContent
          :side="side"
          :side-offset="8"
          class="whitespace-nowrap"
        >
          {{ label }}
        </TooltipContent>
      </Tooltip>
    </span>
  </TooltipProvider>
</template>
