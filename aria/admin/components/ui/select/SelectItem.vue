<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import {
  SelectItem,
  type SelectItemProps,
  SelectItemIndicator,
  SelectItemText,
  useForwardProps,
} from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  SelectItemProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <SelectItem
    v-bind="forwardedProps"
    :class="
      cn(
        'relative flex w-full border-0 border-b border-border border-dashed cursor-default text-muted-foreground select-none items-center py-2 px-3 text-xs outline-none focus-visible:border-0 focus-visible:border-b focus-visible:border-border focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 hover:bg-sidebar/40 hover:text-accent-foreground active:bg-sidebar active:text-accent-foreground disabled:opacity-50 last:border-b-0',
        props.class,
      )
    "
  >
    <SelectItemText class="flex w-full justify-start text-left">
      <slot />
    </SelectItemText>
  </SelectItem>
</template>
