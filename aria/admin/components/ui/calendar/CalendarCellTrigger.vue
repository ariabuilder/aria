<script setup lang="ts">
import type { CalendarCellTriggerProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { CalendarCellTrigger, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const props = defineProps<
  CalendarCellTriggerProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <CalendarCellTrigger
    data-slot="calendar-cell-trigger"
    :class="
      cn(
        buttonVariants({ variant: 'ghost' }),
        'size-9 rounded-sm p-0 text-sm font-medium aria-selected:opacity-100',
        'hover:bg-primary/10 hover:text-foreground',
        '[&[data-today]:not([data-selected])]:bg-background/80 [&[data-today]:not([data-selected])]:text-foreground [&[data-today]:not([data-selected])]:ring-1 [&[data-today]:not([data-selected])]:ring-border/70',
        'data-[selected]:bg-primary/80 data-[selected]:text-primary-foreground data-[selected]:shadow-sm data-[selected]:hover:bg-primary/90 data-[selected]:hover:text-primary-foreground',
        'data-[disabled]:text-muted-foreground/30 data-[disabled]:opacity-40',
        'data-[outside-view]:text-muted-foreground/30 data-[outside-view]:opacity-45',
        'data-[unavailable]:text-muted-foreground/40 data-[unavailable]:line-through',
        props.class,
      )
    "
    v-bind="forwardedProps"
  >
    <slot />
  </CalendarCellTrigger>
</template>
