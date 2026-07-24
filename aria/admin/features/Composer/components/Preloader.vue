<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useAppLoading } from "../composables/useAppLoading";
import { useAppearance } from "../../Design/composables/useAppearance";
import {
  applyPreloaderThemeColors,
  readPreloaderThemeFromDocument,
  resolvePreloaderThemeState,
} from "@/lib/preloader/theme";
import PreloaderAriaLogo from "@/features/Studio/core/components/PreloaderAriaLogo.vue";
import PreloaderFrame from "@/features/Studio/core/components/PreloaderFrame.vue";
import { Z_INDEX } from "@/lib/zIndex";

const { isFullyLoaded } = useAppLoading();
const { settings, isLoading } = useAppearance();
const isVisible = ref(true);
const progress = ref(0);
let progressInterval: ReturnType<typeof setInterval> | null = null;
const MIN_DISPLAY_TIME = 200;

function syncPreloaderThemeColors(): void {
  if (typeof document === "undefined") return;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = isLoading.value
    ? readPreloaderThemeFromDocument()
    : resolvePreloaderThemeState({
        themeId: settings.value.themeId,
        colorScheme: settings.value.colorScheme,
        systemDark,
      });
  applyPreloaderThemeColors(document.documentElement, resolved.themeId, resolved.isDark);
}

onMounted(() => {
  syncPreloaderThemeColors();
  const lastShown = sessionStorage.getItem("aria-preloader-timestamp");
  const now = Date.now();
  const isHMR = lastShown && now - parseInt(lastShown, 10) < 1000;
  const hide = () => {
    isVisible.value = false;
    sessionStorage.setItem("aria-preloader-timestamp", String(Date.now()));
    if (progressInterval) clearInterval(progressInterval);
  };
  if (isHMR) {
    progress.value = 100;
    hide();
    return;
  }

  const startTime = Date.now();
  let isLoaded = false;
  progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const minProgress = Math.min((elapsed / MIN_DISPLAY_TIME) * 90, 90);
    if (progress.value < minProgress) progress.value = minProgress;
    else if (progress.value < 90) progress.value += Math.random() * 8 + 2;
    else if (progress.value < 98 && !isLoaded) progress.value += Math.random();
    progress.value = Math.min(progress.value, isLoaded ? 100 : 97);
  }, 50);

  const checkLoaded = () => {
    if (!isFullyLoaded.value) {
      requestAnimationFrame(checkLoaded);
      return;
    }
    isLoaded = true;
    window.setTimeout(() => {
      progress.value = 100;
      window.setTimeout(hide, 440);
    }, Math.max(0, MIN_DISPLAY_TIME - (Date.now() - startTime)));
  };
  checkLoaded();
  window.setTimeout(() => {
    progress.value = 100;
    window.setTimeout(hide, 440);
  }, 1000);
});

watch(
  () => [settings.value.themeId, settings.value.colorScheme, isLoading.value] as const,
  () => syncPreloaderThemeColors(),
);

onUnmounted(() => { if (progressInterval) clearInterval(progressInterval); });
</script>

<template>
  <transition name="fade">
    <div
      v-if="isVisible"
      class="preloader-root fixed inset-0 flex items-center justify-center"
      :style="{ zIndex: Z_INDEX.shellOverlay }"
    >
      <PreloaderFrame>
        <PreloaderAriaLogo :progress="progress" />
      </PreloaderFrame>
    </div>
  </transition>
</template>

<style scoped>
.preloader-root {
  overflow: hidden;
  background: var(--background);
}
.fade-enter-active, .fade-leave-active { transition: opacity 180ms ease-out; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
