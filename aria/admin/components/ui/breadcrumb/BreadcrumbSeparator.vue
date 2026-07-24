<script lang="ts" setup>
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <li
    data-slot="breadcrumb-separator"
    role="presentation"
    aria-hidden="true"
    :class="cn('inline-flex items-center', props.class)"
  >
    <slot>
      <span class="text-muted-foreground/50">
        /
      </span>
    </slot>
  </li>
</template>
