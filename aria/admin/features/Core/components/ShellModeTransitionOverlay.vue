<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useAppearance } from "@/features/Design/composables/useAppearance";
import {
  applyPreloaderThemeColors,
  readPreloaderThemeFromDocument,
  resolvePreloaderThemeState,
} from "@/lib/preloader/theme";
import PreloaderAriaLogo from "@/features/Studio/core/components/PreloaderAriaLogo.vue";
import PreloaderFrame from "@/features/Studio/core/components/PreloaderFrame.vue";
import { useShellModeTransition } from "../composables/useShellModeTransition";

const props = defineProps<{ visible: boolean }>();
const shellTransition = useShellModeTransition();
const { settings, isLoading: isAppearanceLoading } = useAppearance();
const isMounted = ref(false);
const isRendered = ref(false);
const progress = ref(0);
let progressInterval: ReturnType<typeof setInterval> | null = null;

function syncPreloaderThemeColors(): void {
  if (typeof document === "undefined") return;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = isAppearanceLoading.value
    ? readPreloaderThemeFromDocument()
    : resolvePreloaderThemeState({
        themeId: settings.value.themeId,
        colorScheme: settings.value.colorScheme,
        systemDark,
      });
  applyPreloaderThemeColors(document.documentElement, resolved.themeId, resolved.isDark);
}

function clearProgressInterval(): void {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function startProgressAnimation(): void {
  clearProgressInterval();
  progress.value = 0;
  progressInterval = setInterval(() => {
    if (progress.value < 90) progress.value = Math.min(progress.value + Math.random() * 6 + 2, 90);
    else if (progress.value < 97) progress.value += Math.random() * 0.5;
  }, 50);
}

function finishAndHide(): void {
  clearProgressInterval();
  progress.value = 100;
  window.setTimeout(() => {
    isRendered.value = false;
    window.setTimeout(() => {
      isMounted.value = false;
      shellTransition.notifyOverlayHidden();
    }, 200);
  }, 440);
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      isMounted.value = true;
      isRendered.value = true;
      syncPreloaderThemeColors();
      startProgressAnimation();
    } else if (isMounted.value) {
      finishAndHide();
    }
  },
  { immediate: true },
);

watch(
  () => [settings.value.themeId, settings.value.colorScheme, isAppearanceLoading.value] as const,
  () => syncPreloaderThemeColors(),
);

onMounted(syncPreloaderThemeColors);
onUnmounted(clearProgressInterval);
</script>

<template>
  <Teleport to="body">
    <Transition name="shell-mode-fade">
      <div
        v-if="isMounted"
        v-show="isRendered"
        class="shell-mode-overlay"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <PreloaderFrame>
          <PreloaderAriaLogo :progress="progress" />
        </PreloaderFrame>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.shell-mode-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-shell-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--background);
  pointer-events: all;
}

.shell-mode-fade-enter-active,
.shell-mode-fade-leave-active {
  transition: opacity 180ms ease-out;
}

.shell-mode-fade-enter-from,
.shell-mode-fade-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .shell-mode-fade-enter-active,
  .shell-mode-fade-leave-active { transition-duration: 0.01ms; }
}
</style>
