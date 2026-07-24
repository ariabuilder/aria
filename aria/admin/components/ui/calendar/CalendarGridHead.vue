<script setup lang="ts">
import type { CalendarGridHeadProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { CalendarGridHead, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  CalendarGridHeadProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <CalendarGridHead
    data-slot="calendar-grid-head"
    :class="cn(props.class)"
    v-bind="forwardedProps"
  >
    <slot />
  </CalendarGridHead>
</template>
