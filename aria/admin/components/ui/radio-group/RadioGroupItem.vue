<script setup lang="ts">
import {
  RadioGroupIndicator,
  RadioGroupItem,
  type RadioGroupItemProps,
} from "reka-ui";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";

const props = defineProps<RadioGroupItemProps>();
</script>

<template>
  <RadioGroupItem
    v-bind="props"
    :class="
      cn(
        'rounded-sm border border-border border-solid hover:border-dashed hover:border-border text-primary-foreground shadow-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <RadioGroupIndicator class="flex items-center justify-center">
      <span
        aria-hidden="true"
        :class="[studioIcons.check, 'size-3.5 shrink-0']"
      />
    </RadioGroupIndicator>
  </RadioGroupItem>
</template>
