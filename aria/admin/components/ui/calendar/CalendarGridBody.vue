<script setup lang="ts">
import type { CalendarGridBodyProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { CalendarGridBody, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  CalendarGridBodyProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <CalendarGridBody
    data-slot="calendar-grid-body"
    :class="cn(props.class)"
    v-bind="forwardedProps"
  >
    <slot />
  </CalendarGridBody>
</template>
