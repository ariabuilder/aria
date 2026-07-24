<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import {
  SelectIcon,
  SelectTrigger,
  type SelectTriggerProps,
  useForwardProps,
} from "reka-ui";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";

const props = defineProps<
  SelectTriggerProps & {
    class?: HTMLAttributes["class"];
    hideIcon?: boolean;
  }
>();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <SelectTrigger
    v-bind="forwardedProps"
    :class="
      cn(
        'flex h-9! w-full items-center justify-between border border-border/50 border-solid bg-sidebar/40 px-4 py-1 text-sm placeholder:text-muted-foreground shadow-none transition-[color,box-shadow] outline-none focus:outline-none focus:ring-0 hover:bg-sidebar/80 hover:border-border/50 hover:border-solid focus-visible:border-border focus-visible:bg-sidebar/80 focus-visible:ring-border/50 focus-visible:ring-[1px] focus-visible:border-solid focus-visible:shadow-none focus-active:border-primary/80 focus-active:bg-sidebar data-[state=open]:border-border data-[state=open]:bg-sidebar/80 data-[state=open]:ring-border/50 data-[state=open]:ring-[1px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate text-start rounded-sm cursor-pointer',
        props.class,
      )
    "
  >
    <slot />
    <SelectIcon v-if="!hideIcon" as-child>
      <span
        aria-hidden="true"
        :class="[studioIcons.chevronDown, 'size-3.5 shrink-0 opacity-50']"
      />
    </SelectIcon>
  </SelectTrigger>
</template>
