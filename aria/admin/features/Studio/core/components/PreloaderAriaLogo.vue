<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  ARIA_MARK_ACCENT_PATH,
  ARIA_MARK_BODY_PATH,
  ARIA_MARK_TRANSFORM,
  ARIA_MARK_VIEWBOX,
} from "@/lib/preloader/ariaMark";

const props = withDefaults(
  defineProps<{
    class?: string;
    compact?: boolean;
    progress?: number;
  }>(),
  { compact: false, progress: 0 },
);

const displayedProgress = ref(0);
let animationFrame: number | null = null;
let previousFrameAt: number | null = null;

const normalizedProgress = computed(() => displayedProgress.value / 100);
const accentOpacity = computed(() => {
  const value = Math.min(1, Math.max(0, (displayedProgress.value - 68) / 32));
  return value * value * (3 - 2 * value);
});

function animateProgress(now: number): void {
  const target = Math.min(100, Math.max(0, props.progress));
  const elapsed = previousFrameAt == null ? 16 : Math.min(now - previousFrameAt, 64);
  previousFrameAt = now;

  const delta = target - displayedProgress.value;
  if (Math.abs(delta) <= 0.05) {
    displayedProgress.value = target;
    animationFrame = null;
    previousFrameAt = null;
    return;
  }

  const responseMs = target >= 99.9 ? 82 : 68;
  const smoothing = 1 - Math.exp(-elapsed / responseMs);
  displayedProgress.value += delta * smoothing;
  animationFrame = requestAnimationFrame(animateProgress);
}

watch(
  () => props.progress,
  () => {
    if (animationFrame == null) animationFrame = requestAnimationFrame(animateProgress);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (animationFrame != null) cancelAnimationFrame(animationFrame);
});
</script>

<template>
  <div
    class="preloader-aria-logo"
    :class="[
      $props.class,
      { 'preloader-aria-logo--compact': compact },
    ]"
  >
    <svg
      class="preloader-aria-logo__svg"
      :viewBox="ARIA_MARK_VIEWBOX"
      fill-rule="evenodd"
      clip-rule="evenodd"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g :transform="ARIA_MARK_TRANSFORM">
        <path :d="ARIA_MARK_BODY_PATH" class="preloader-aria-logo__body" />
        <path
          :d="ARIA_MARK_ACCENT_PATH"
          class="preloader-aria-logo__accent-guide"
          vector-effect="non-scaling-stroke"
        />
        <path
          :d="ARIA_MARK_ACCENT_PATH"
          class="preloader-aria-logo__accent-progress"
          pathLength="1"
          vector-effect="non-scaling-stroke"
          :style="{ strokeDashoffset: 1 - normalizedProgress }"
        />
        <path
          :d="ARIA_MARK_ACCENT_PATH"
          class="preloader-aria-logo__accent-solid"
          :style="{ opacity: accentOpacity }"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.preloader-aria-logo {
  width: 8rem;
  height: calc(8rem * 621 / 727);
  flex-shrink: 0;
}

.preloader-aria-logo--compact {
  width: 4rem;
  height: calc(4rem * 621 / 727);
}

.preloader-aria-logo__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.preloader-aria-logo__body {
  fill: color-mix(
    in oklch,
    var(--foreground) 80%,
    transparent
  );
  opacity: 0;
  animation: preloader-mark-body-in 480ms ease-out 80ms forwards;
}

:global(.dark) .preloader-aria-logo__body {
  fill: color-mix(
    in oklch,
    var(--foreground) 70%,
    transparent
  );
}

.preloader-aria-logo__accent-guide,
.preloader-aria-logo__accent-progress {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.25;
}

.preloader-aria-logo__accent-guide {
  stroke: color-mix(
    in oklch,
    var(--preloader-fill, var(--primary)) 14%,
    transparent
  );
}

.preloader-aria-logo__accent-progress {
  stroke: var(--preloader-fill, var(--primary));
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  will-change: stroke-dashoffset;
}

.preloader-aria-logo__accent-solid {
  fill: var(--preloader-fill, var(--primary));
  opacity: 0;
  will-change: opacity;
}

@keyframes preloader-mark-body-in {
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .preloader-aria-logo__body {
    opacity: 1;
    animation: none;
  }

  .preloader-aria-logo__accent-progress,
  .preloader-aria-logo__accent-solid { will-change: auto; }
}
</style>
