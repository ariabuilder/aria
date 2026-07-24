<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  { compact: false },
);
</script>

<template>
  <div class="preloader-frame">
    <span class="preloader-frame__grid" aria-hidden="true" />
    <slot />
  </div>
</template>

<style scoped>
.preloader-frame {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  pointer-events: none;
}

.preloader-frame__grid {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
    circle,
    color-mix(in oklch, var(--foreground) 18%, transparent) 1.15px,
    transparent 1.15px
  );
  background-size: 24px 24px;
  opacity: 0;
  -webkit-mask-image: radial-gradient(
    ellipse at center,
    black 50%,
    transparent 75%
  );
  mask-image: radial-gradient(ellipse at center, black 50%, transparent 75%);
  animation: preloader-frame-grid-in 720ms ease-out 80ms forwards;
}

:global(.dark) .preloader-frame__grid {
  background-image: radial-gradient(
    circle,
    color-mix(in oklch, var(--foreground) 10%, transparent) 1.15px,
    transparent 1.15px
  );
}

@keyframes preloader-frame-grid-in {
  to { opacity: 0.5; }
}

@media (prefers-reduced-motion: reduce) {
  .preloader-frame__grid {
    opacity: 0.5;
    animation: none;
  }
}
</style>
