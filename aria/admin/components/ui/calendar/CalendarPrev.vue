<script setup lang="ts">
import type { CalendarPrevProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { CalendarPrev, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";

const props = defineProps<
  CalendarPrevProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <CalendarPrev
    data-slot="calendar-prev"
    :class="
      cn(
        buttonVariants({ variant: 'outline' }),
        'size-8 justify-self-start rounded-sm border-border/60 bg-background/40! p-0 text-muted-foreground/80 opacity-100 hover:border-primary/70 hover:bg-primary/10! hover:text-foreground focus-visible:ring-primary/30 data-[disabled]:opacity-30',
        props.class,
      )
    "
    v-bind="forwardedProps"
  >
    <span :class="[studioIcons.chevronLeft, 'size-4']" />
  </CalendarPrev>
</template>
