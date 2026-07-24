<script setup lang="ts">
import type { ContextMenuContentEmits, ContextMenuContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit, useColorMode } from "@vueuse/core";
import {
  ContextMenuContent,
  ContextMenuPortal,
  useForwardPropsEmits,
} from "reka-ui";
import { cn } from "@/lib/utils";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<
  ContextMenuContentProps & { class?: HTMLAttributes["class"] }
>();
const emits = defineEmits<ContextMenuContentEmits>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);

// Get computed panel background based on light/dark mode
const isDark = useColorMode().value === "dark";
</script>

<template>
  <ContextMenuPortal>
    <ContextMenuContent
      v-bind="{ ...$attrs, ...forwarded }"
      :class="
        cn(
          'z-50 min-w-auto overflow-hidden rounded-sm border border-dashed border-border text-foreground/80 bg-input shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          props.class,
        )
      "
    >
      <slot />
    </ContextMenuContent>
  </ContextMenuPortal>
</template>
