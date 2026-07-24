<script setup lang="ts">
import { computed } from "vue";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import { cn } from "@/lib/utils";
import {
  FLICKERING_BOTTOM_GRID_MASK_CLASS,
  FLICKERING_BOTTOM_CENTER_GRID_MASK_CLASS,
  FLICKERING_DASHBOARD_STAT_GRID_PROPS,
  FLICKERING_NAV_GRID_MASK_CLASS,
  FLICKERING_NAV_GRID_PROPS,
  type FlickeringGridBackdropOrigin,
  type FlickeringNavGridProps,
} from "../lib/flickeringNavGrid";

const props = withDefaults(
  defineProps<{
    fadeOnHover?: boolean;
    origin?: FlickeringGridBackdropOrigin;
    /** Preset tuned for dashboard stat cards. */
    variant?: "nav" | "dashboard-stat";
    maxOpacity?: number;
    accentMaxOpacity?: number;
    accentChance?: number;
    flickerChance?: number;
    squareSize?: number;
    gridGap?: number;
    revealDuration?: number;
    revealStagger?: number;
  }>(),
  {
    fadeOnHover: false,
    origin: "left",
    variant: "nav",
  },
);

const maskClass = computed(() => {
  if (props.origin === "bottom-center") {
    return FLICKERING_BOTTOM_CENTER_GRID_MASK_CLASS;
  }
  return props.origin === "bottom"
    ? FLICKERING_BOTTOM_GRID_MASK_CLASS
    : FLICKERING_NAV_GRID_MASK_CLASS;
});

const gridRevealOrigin = computed(() =>
  props.origin === "bottom" || props.origin === "bottom-center"
    ? "bottom"
    : "right",
);

const baseGridProps = computed(
  (): FlickeringNavGridProps =>
    props.variant === "dashboard-stat"
      ? FLICKERING_DASHBOARD_STAT_GRID_PROPS
      : FLICKERING_NAV_GRID_PROPS,
);

const gridProps = computed(() => ({
  ...baseGridProps.value,
  ...(props.squareSize !== undefined ? { squareSize: props.squareSize } : {}),
  ...(props.gridGap !== undefined ? { gridGap: props.gridGap } : {}),
  ...(props.flickerChance !== undefined
    ? { flickerChance: props.flickerChance }
    : {}),
  ...(props.maxOpacity !== undefined ? { maxOpacity: props.maxOpacity } : {}),
  ...(props.accentChance !== undefined
    ? { accentChance: props.accentChance }
    : {}),
  ...(props.accentMaxOpacity !== undefined
    ? { accentMaxOpacity: props.accentMaxOpacity }
    : {}),
  ...(props.revealDuration !== undefined
    ? { revealDuration: props.revealDuration }
    : {}),
  ...(props.revealStagger !== undefined
    ? { revealStagger: props.revealStagger }
    : {}),
}));
</script>

<template>
  <span
    :class="
      cn(
        maskClass,
        'pointer-events-none absolute inset-0 z-0 size-full overflow-hidden',
        fadeOnHover &&
          'opacity-50 transition-opacity delay-50 duration-600 ease-in-out group-hover:opacity-100',
      )
    "
    aria-hidden="true"
  >
    <FlickeringGrid v-bind="gridProps" :reveal-origin="gridRevealOrigin" />
  </span>
</template>

<style scoped>
.flickering-nav-grid-mask {
  -webkit-mask-image: linear-gradient(to left, black 30%, transparent 60%);
  mask-image: linear-gradient(to left, black 30%, transparent 60%);
}

.flickering-bottom-grid-mask {
  -webkit-mask-image: linear-gradient(to top, black 30%, transparent 60%);
  mask-image: linear-gradient(to top, black 30%, transparent 60%);
}

.flickering-bottom-center-grid-mask {
  -webkit-mask-image: radial-gradient(
    ellipse 82% 52% at 50% 100%,
    black 0%,
    black 30%,
    transparent 100%
  );
  mask-image: radial-gradient(
    ellipse 82% 52% at 50% 100%,
    black 0%,
    black 30%,
    transparent 100%
  );
}
</style>
