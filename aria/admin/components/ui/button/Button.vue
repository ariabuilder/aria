<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import type { ButtonVariants } from ".";
import { cn } from "@/lib/utils";
import { buttonVariants } from ".";
import { computed } from "vue";

interface Props {
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  class?: HTMLAttributes["class"];
  as?: string;
  asChild?: boolean;
  disabled?: boolean;
  type?: string;
}

const props = withDefaults(defineProps<Props>(), {
  as: "button",
});

const tag = computed(() => (props.asChild ? "slot" : props.as || "button"));
</script>

<template>
  <component
    :is="tag"
    data-slot="button"
    :disabled="disabled"
    :type="tag === 'button' ? type || 'button' : undefined"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </component>
</template>
