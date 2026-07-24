<script setup lang="ts">
import type { CalendarHeaderProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { CalendarHeader, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  CalendarHeaderProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <CalendarHeader
    data-slot="calendar-header"
    :class="
      cn(
        'grid w-full grid-cols-[2rem_1fr_2rem] items-center gap-2',
        props.class,
      )
    "
    v-bind="forwardedProps"
  >
    <slot />
  </CalendarHeader>
</template>
