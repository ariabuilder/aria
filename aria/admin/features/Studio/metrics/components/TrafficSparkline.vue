<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    values: readonly number[];
    width?: number;
    height?: number;
    /** Stretch to the parent box (dashboard traffic card). */
    responsive?: boolean;
    /** Fill under the line — intended for larger chart surfaces. */
    area?: boolean;
  }>(),
  {
    width: 56,
    height: 20,
    responsive: false,
    area: false,
  },
);

const viewWidth = computed(() => (props.responsive ? 320 : props.width));
const viewHeight = computed(() => (props.responsive ? 72 : props.height));

const pathD = computed(() => {
  const values = props.values;
  if (!values.length) {
    return "";
  }

  const max = Math.max(...values, 1);
  const w = viewWidth.value;
  const h = viewHeight.value;
  const padY = props.responsive ? 4 : 1;
  const step = w / Math.max(values.length - 1, 1);

  const points = values.map((value, index) => {
    const x = index * step;
    const y = h - (value / max) * (h - padY * 2) - padY;
    return `${x},${y}`;
  });

  return `M ${points.join(" L ")}`;
});

const areaD = computed(() => {
  if (!props.area || !pathD.value) {
    return "";
  }
  const w = viewWidth.value;
  const h = viewHeight.value;
  return `${pathD.value} L ${w},${h} L 0,${h} Z`;
});
</script>

<template>
  <svg
    :width="responsive ? '100%' : width"
    :height="responsive ? '100%' : height"
    :viewBox="`0 0 ${viewWidth} ${viewHeight}`"
    :preserve-aspect-ratio="responsive ? 'none' : undefined"
    :class="responsive ? 'text-primary/80 block' : 'text-primary/70'"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-if="areaD"
      :d="areaD"
      class="fill-primary/15"
      stroke="none"
    />
    <path
      v-if="pathD"
      :d="pathD"
      fill="none"
      stroke="currentColor"
      :stroke-width="responsive ? 2 : 1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
