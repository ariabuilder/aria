<script setup lang="ts">
defineProps<{
  text: string;
}>();
</script>

<template>
  <span class="t-shimmer" :data-text="text">{{ text }}</span>
</template>

<style scoped>
.t-shimmer {
  --shimmer-dur: 2000ms;
  --shimmer-base: var(--muted-foreground);
  --shimmer-highlight: var(--foreground);
  --shimmer-band: 400%;
  --shimmer-ease: linear;
  position: relative;
  display: inline-block;
  color: var(--shimmer-base);
}

.t-shimmer::before {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    transparent 40%,
    var(--shimmer-highlight) 50%,
    transparent 60%,
    transparent 100%
  );
  background-size: var(--shimmer-band) 100%;
  background-repeat: no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: t-shimmer var(--shimmer-dur) var(--shimmer-ease) infinite;
}

@keyframes t-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .t-shimmer::before {
    animation: none !important;
  }
}
</style>
