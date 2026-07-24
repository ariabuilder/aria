<script setup lang="ts">
defineProps<{
  visible: boolean;
  top: number;
  height: number;
  animated: boolean;
}>();
</script>

<template>
  <div
    v-show="visible"
    class="sliding-nav-indicator pointer-events-none absolute left-0 top-0 z-20 w-0.5 bg-primary"
    :class="animated && 'sliding-nav-indicator--animated'"
    :style="{
      transform: `translateY(${top}px)`,
      height: `${height}px`,
    }"
    aria-hidden="true"
  />
</template>

<style scoped>
.sliding-nav-indicator--animated {
  will-change: transform, height;
  transition:
    transform 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    height 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
