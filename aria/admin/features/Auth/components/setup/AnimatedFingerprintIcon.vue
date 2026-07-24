<script setup lang="ts">
/**
 * Inline Hugeicons fingerprint with stroke-draw animation.
 * A static layer guarantees the icon resolves completely; the animated
 * overlay is removed once the draw finishes.
 */

import { nextTick, onMounted, ref, watch } from "vue";

const FINGERPRINT_PATHS = [
  "M7.429 3.362c3.97-2.698 9.707-1.238 11.801 3.056m-8.373 15.506C15.584 22.582 20 18.895 20 14.21v-3.877M7.429 20.606C5.356 19.198 4 16.858 4 14.21V9.758c0-1.185.271-2.308.757-3.314",
  "M16 13.8c0 2.32-1.79 4.2-4 4.2s-4-1.88-4-4.2v-3.6c0-.644.138-1.254.385-1.8M12 6c2.21 0 4 1.88 4 4.2m-4 .3v3",
] as const;

const DRAW_STAGGER_MS = 180;

const props = withDefaults(
  defineProps<{
    class?: string;
    /** Continuous scan while waiting on the device or browser. */
    loop?: boolean;
  }>(),
  {
    loop: false,
  },
);

const pathEls = ref<(SVGPathElement | null)[]>([]);
const pathLengths = ref<number[]>([]);
const drawActive = ref(false);
const drawSettled = ref(false);
const prefersReducedMotion = ref(false);

function setPathRef(index: number, element: unknown) {
  pathEls.value[index] = element as SVGPathElement | null;
}

function measurePaths(): boolean {
  pathLengths.value = FINGERPRINT_PATHS.map((_, index) => {
    const length = pathEls.value[index]?.getTotalLength() ?? 0;
    return Number.isFinite(length) ? length : 0;
  });

  return pathLengths.value.every((length) => length > 0);
}

function startDrawAnimation() {
  drawSettled.value = false;
  drawActive.value = false;

  if (prefersReducedMotion.value) {
    drawSettled.value = true;
    return;
  }

  if (props.loop) return;

  requestAnimationFrame(() => {
    drawActive.value = true;
  });
}

function handleDrawEnd(index: number) {
  if (props.loop || index !== FINGERPRINT_PATHS.length - 1) return;
  drawSettled.value = true;
}

function overlayPathStyle(index: number): Record<string, string | number> {
  const length = pathLengths.value[index] ?? 0;
  if (!length) return { visibility: "hidden" };

  if (props.loop) {
    return {
      "--path-length": `${length}px`,
      "--line-delay": `${index * DRAW_STAGGER_MS}ms`,
      strokeDasharray: `${length}`,
      strokeDashoffset: `${length}`,
    };
  }

  return {
    strokeDasharray: `${length}`,
    strokeDashoffset: drawActive.value ? "0" : `${length}`,
    transition: `stroke-dashoffset 1.15s cubic-bezier(0.4, 0, 0.2, 1) ${index * DRAW_STAGGER_MS}ms forwards`,
  };
}

async function prepareAnimation() {
  await nextTick();

  if (!measurePaths()) {
    requestAnimationFrame(() => {
      if (!measurePaths()) return;
      startDrawAnimation();
    });
    return;
  }

  startDrawAnimation();
}

onMounted(async () => {
  prefersReducedMotion.value = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  await prepareAnimation();
});

watch(
  () => props.loop,
  async (loop) => {
    await prepareAnimation();
    if (loop) {
      drawSettled.value = false;
      drawActive.value = false;
    }
  },
);
</script>

<template>
  <svg
    class="animated-fingerprint-icon shrink-0"
    :class="[$props.class, loop && 'animated-fingerprint-icon--loop']"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g
      class="animated-fingerprint-icon__static"
      :class="{ 'animated-fingerprint-icon__static--visible': drawSettled && !loop }"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    >
      <path v-for="(path, index) in FINGERPRINT_PATHS" :key="`static-${index}`" :d="path" />
    </g>

    <g
      v-if="!drawSettled || loop"
      class="animated-fingerprint-icon__overlay"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    >
      <path
        v-for="(path, index) in FINGERPRINT_PATHS"
        :key="`overlay-${index}`"
        :ref="(element) => setPathRef(index, element)"
        :d="path"
        class="animated-fingerprint-icon__line"
        :style="overlayPathStyle(index)"
        @transitionend="handleDrawEnd(index)"
      />
    </g>
  </svg>
</template>

<style scoped>
.animated-fingerprint-icon {
  display: block;
  overflow: visible;
}

.animated-fingerprint-icon__static {
  opacity: 0;
}

.animated-fingerprint-icon__static--visible {
  opacity: 1;
}

.animated-fingerprint-icon--loop .animated-fingerprint-icon__line {
  animation: animated-fingerprint-scan 2.8s ease-in-out var(--line-delay, 0ms)
    infinite;
}

@keyframes animated-fingerprint-scan {
  0%,
  16%,
  100% {
    stroke-dashoffset: var(--path-length);
    opacity: 0.45;
  }

  44%,
  56% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .animated-fingerprint-icon__static {
    opacity: 1;
  }

  .animated-fingerprint-icon__overlay {
    display: none;
  }
}
</style>
