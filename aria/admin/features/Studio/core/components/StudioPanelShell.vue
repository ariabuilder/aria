<script setup lang="ts">
import { cn } from "@/lib/utils";
import {
  STUDIO_RAIL_LAYOUT_CLASS,
  STUDIO_VIEW_CONTENT_CLASS,
  STUDIO_VIEW_ROOT_CLASS,
} from "../lib/studioPanelShell";

const props = withDefaults(
  defineProps<{
    /** Organizer rail beside content (still inside StudioApp main). */
    variant?: "default" | "rail";
    contentClass?: string;
  }>(),
  { variant: "default" },
);
</script>

<template>
  <div
    :class="
      props.variant === 'rail' ? STUDIO_RAIL_LAYOUT_CLASS : STUDIO_VIEW_ROOT_CLASS
    "
  >
    <slot name="rail" />
    <div
      v-if="variant === 'rail'"
      :class="cn(STUDIO_VIEW_CONTENT_CLASS, contentClass)"
    >
      <slot />
    </div>
    <slot v-else />
  </div>
</template>
