<script setup lang="ts">
import type { TooltipContentEmits, TooltipContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import {
  TooltipArrow,
  TooltipContent,
  TooltipPortal,
  useForwardPropsEmits,
} from "reka-ui";
import { cn } from "@/lib/utils";

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<
    TooltipContentProps & {
      class?: HTMLAttributes["class"];
      /** When false, render inline instead of teleporting to body. */
      portalled?: boolean;
    }
  >(),
  {
    sideOffset: 4,
    portalled: true,
  },
);

const emits = defineEmits<TooltipContentEmits>();

const delegatedProps = reactiveOmit(props, "class", "portalled");
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <TooltipPortal :disabled="!props.portalled">
    <TooltipContent
      data-slot="tooltip-content"
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'pointer-events-none select-none bg-background border-border border border-dashed text-muted-foreground duration-80 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit rounded-sm px-4 py-1.5 text-xs text-balance shadow-xl',
          props.class,
        )
      "
    >
      <slot />

      <TooltipArrow
        class="bg-background fill-background border-border border-r border-b z-50 border-dashed size-2 translate-y-[calc(-50%)] rotate-45 rounded-xs"
      />
    </TooltipContent>
  </TooltipPortal>
</template>
