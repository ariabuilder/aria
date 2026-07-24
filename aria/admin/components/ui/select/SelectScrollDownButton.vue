<script setup lang="ts">
import { type HTMLAttributes, computed } from "vue";
import {
  SelectScrollDownButton,
  type SelectScrollDownButtonProps,
  useForwardProps,
} from "reka-ui";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";

const props = defineProps<
  SelectScrollDownButtonProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <SelectScrollDownButton
    v-bind="forwardedProps"
    :class="
      cn('flex cursor-default items-center justify-center py-1', props.class)
    "
  >
    <slot>
      <span
        aria-hidden="true"
        :class="[studioIcons.chevronDown, 'size-4 shrink-0']"
      />
    </slot>
  </SelectScrollDownButton>
</template>
