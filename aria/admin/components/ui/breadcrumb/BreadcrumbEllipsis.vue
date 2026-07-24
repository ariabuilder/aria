<script lang="ts" setup>
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <span
    data-slot="breadcrumb-ellipsis"
    role="presentation"
    aria-hidden="true"
    :class="cn('flex size-9 items-center justify-center', props.class)"
  >
    <slot>
      <span
        aria-hidden="true"
        :class="[studioIcons.moreHorizontal, 'size-4 shrink-0']"
      />
    </slot>
    <span class="sr-only">More</span>
  </span>
</template>
