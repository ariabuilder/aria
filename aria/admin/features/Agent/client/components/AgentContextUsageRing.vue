<script setup lang="ts">
import { computed } from "vue";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatTokenCount,
  type AgentContextUsage,
} from "../../lib/contextUsage";

const props = defineProps<{
  usage: AgentContextUsage;
}>();

const size = 18;
const strokeWidth = 2.25;
const radius = (size - strokeWidth) / 2;

const label = computed(
  () =>
    `${formatTokenCount(props.usage.estimatedTokens)} / ${formatTokenCount(props.usage.contextLimit)}`,
);

const ariaLabel = computed(
  () => `Context usage: ${label.value} tokens, approximate`,
);

const fillPercent = computed(() => props.usage.fillRatio * 100);

const ringClass = computed(() => {
  if (props.usage.tone === "critical") {
    return "text-destructive";
  }

  if (props.usage.tone === "warning") {
    return "text-amber-500";
  }

  return "text-foreground/70";
});
</script>

<template>
  <TooltipProvider :delay-duration="400" :disable-hoverable-content="true">
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          class="inline-flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          :aria-label="ariaLabel"
        >
          <svg
            :width="size"
            :height="size"
            viewBox="0 0 18 18"
            class="block -rotate-90"
            aria-hidden="true"
          >
            <circle
              :cx="size / 2"
              :cy="size / 2"
              :r="radius"
              fill="none"
              stroke="currentColor"
              :stroke-width="strokeWidth"
              class="text-muted-foreground/25"
            />
            <circle
              :cx="size / 2"
              :cy="size / 2"
              :r="radius"
              fill="none"
              stroke="currentColor"
              :stroke-width="strokeWidth"
              stroke-linecap="round"
              pathLength="100"
              :stroke-dasharray="100"
              :stroke-dashoffset="100 - fillPercent"
              :class="[
                ringClass,
                'transition-[stroke-dashoffset] duration-300 ease-out',
              ]"
            />
          </svg>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        :side-offset="4"
        class="pointer-events-none border-0 bg-transparent px-0 py-0 text-[11px] leading-none text-muted-foreground shadow-none [&>svg]:hidden"
      >
        {{ label }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
