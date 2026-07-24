<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import {
  SelectScrollUpButton,
  type SelectScrollUpButtonProps,
  useForwardProps,
} from "reka-ui";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";

const props = defineProps<
  SelectScrollUpButtonProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <SelectScrollUpButton
    v-bind="forwardedProps"
    :class="
      cn('flex cursor-default items-center justify-center py-1', props.class)
    "
  >
    <slot>
      <span
        aria-hidden="true"
        :class="[studioIcons.chevronUp, 'size-4 shrink-0']"
      />
    </slot>
  </SelectScrollUpButton>
</template>
