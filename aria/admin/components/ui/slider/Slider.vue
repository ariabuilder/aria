<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  type SliderRootEmits,
  type SliderRootProps,
  useForwardPropsEmits,
} from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  SliderRootProps & { class?: HTMLAttributes["class"] }
>();
const emits = defineEmits<SliderRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <SliderRoot
    v-bind="forwarded"
    :class="
      cn(
        'relative flex w-full touch-none select-none items-center',
        props.class,
      )
    "
  >
    <SliderTrack
      class="relative h-2.5 w-full grow overflow-hidden rounded-full bg-muted/70"
    >
      <SliderRange class="absolute h-full bg-foreground" />
    </SliderTrack>
    <SliderThumb
      class="block size-4 rounded-full border border-foreground/20 bg-background shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
    />
  </SliderRoot>
</template>
