<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import PreloaderAriaLogo from "../../Studio/core/components/PreloaderAriaLogo.vue";
import PreloaderFrame from "../../Studio/core/components/PreloaderFrame.vue";

interface Props {
  isLoading: boolean;
  loadError: string | null;
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
});
const progress = ref(0);
let progressInterval: ReturnType<typeof setInterval> | null = null;

function stopProgress(): void {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

watch(
  () => props.isLoading,
  (isLoading) => {
    stopProgress();
    if (!isLoading) {
      progress.value = 100;
      return;
    }

    progress.value = 0;
    progressInterval = setInterval(() => {
      progress.value = Math.min(progress.value + Math.random() * 8 + 3, 92);
    }, 90);
  },
  { immediate: true },
);

onUnmounted(stopProgress);
</script>

<template>
  <div
    v-if="isLoading"
    class="relative flex h-full items-center justify-center bg-background"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <PreloaderFrame :compact="props.compact">
      <PreloaderAriaLogo :compact="props.compact" :progress="progress" />
    </PreloaderFrame>
    <span class="sr-only">Loading canvas</span>
  </div>

  <div v-else-if="loadError" class="flex items-center justify-center h-full">
    <div class="text-center text-red-500">
      <p class="font-semibold">Error</p>
      <p class="text-sm">{{ loadError }}</p>
    </div>
  </div>
</template>
