<script setup lang="ts">
withDefaults(
  defineProps<{
    animated?: boolean;
  }>(),
  { animated: false },
);

defineOptions({ name: "DbDotGridBackdrop" });
</script>

<template>
  <span
    class="db-dot-grid-backdrop pointer-events-none absolute inset-0 overflow-hidden"
    :class="{ 'auth-dot-grid-backdrop': animated }"
    aria-hidden="true"
  />
</template>

<style scoped>
.auth-dot-grid-backdrop {
  animation: auth-grid-fade-in 720ms ease-out 80ms both;
}

@keyframes auth-grid-fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-dot-grid-backdrop {
    animation: none;
    opacity: 0.5;
  }
}
</style>
