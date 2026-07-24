<script setup lang="ts">
import { computed } from "vue";

interface Props {
  /** Progress value 0-100 */
  value: number;
  /** SVG size in pixels (width and height) */
  size?: number;
  strokeWidth?: number;
  /** CSS class for the progress arc color. Defaults to text-primary */
  color?: string;
  /** CSS class for the background track color. Defaults to text-muted/30 */
  trackColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 48,
  strokeWidth: 4,
});

const center = computed(() => props.size / 2);
const radius = computed(() => center.value - props.strokeWidth / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const offset = computed(() => {
  const clamped = Math.max(0, Math.min(100, props.value));
  return circumference.value * (1 - clamped / 100);
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    class="-rotate-90"
    :viewBox="`0 0 ${size} ${size}`"
    role="progressbar"
    :aria-valuenow="value"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <!-- Background track -->
    <circle
      :cx="center"
      :cy="center"
      :r="radius"
      fill="none"
      stroke="currentColor"
      :stroke-width="strokeWidth"
      :class="trackColor || 'text-muted/30'"
      opacity="0.3"
    />
    <!-- Progress arc -->
    <circle
      :cx="center"
      :cy="center"
      :r="radius"
      fill="none"
      stroke="currentColor"
      :stroke-width="strokeWidth"
      :stroke-dasharray="circumference"
      :stroke-dashoffset="offset"
      stroke-linecap="round"
      :class="color || 'text-primary'"
      style="transition: stroke-dashoffset 0.5s ease"
    />
  </svg>
</template>
