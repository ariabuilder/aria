<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { computeArtboardLayout } from "../utils/canvasArtboardLayout";
import { useOptionalStageIframeRef } from "../../Core/composables/useAppInjectedRuntime";
import { useCanvasHorizontalScroll } from "../composables/useCanvasHorizontalScroll";
import { useCanvasZoomTransition } from "../composables/useCanvasZoomTransition";
import { useCanvasWheelZoom } from "../composables/useCanvasWheelZoom";

const props = defineProps<{
  isPreview: boolean;
  canvasStyle: Record<string, string>;
  scale: number;
  hasInitialLoad: boolean;
  background: string;
  viewport: string;
}>();

const emit = defineEmits<{
  (event: "resize", width: number, height: number): void;
  (event: "exitPreview"): void;
  (event: "artboard-click"): void;
}>();

const artboardLayout = computed(() =>
  computeArtboardLayout(props.canvasStyle, props.scale),
);

const outerStyle = computed(() => ({
  background: props.background,
  minWidth: "100%",
  width: "max-content",
  flexShrink: "0",
  transform: "none",
  transformOrigin: "top left",
  height: "100%",
}));

const slotStyle = computed(() => ({
  ...artboardLayout.value.slotStyle,
  background: props.background,
}));

const artboardStyle = computed(() => ({
  ...artboardLayout.value.artboardStyle,
  background: props.background,
}));

const isFixedArtboard = computed(() => artboardLayout.value.mode === "fixed");

const zoomAnimateClass = computed(() =>
  props.hasInitialLoad ? "canvas-zoom-animate" : "",
);

const slotClass = computed(() => [
  "shrink-0",
  zoomAnimateClass.value,
  isFixedArtboard.value ? "relative overflow-visible" : "",
]);

const artboardClass = computed(() => [
  "overflow-hidden",
  isFixedArtboard.value
    ? "h-full shrink-0 absolute left-0 top-0"
    : "h-full w-full max-w-full relative",
  zoomAnimateClass.value,
]);

const containerRef = ref<HTMLElement | null>(null);
const stageIframeRef = useOptionalStageIframeRef();
let resizeObserver: ResizeObserver | null = null;

useCanvasHorizontalScroll(containerRef, { iframeRef: stageIframeRef });
useCanvasZoomTransition(
  containerRef,
  () => props.scale,
  () => props.hasInitialLoad,
);
useCanvasWheelZoom(containerRef, {
  enabled: () => props.hasInitialLoad && !props.isPreview,
  iframeRef: stageIframeRef,
});

const updateWidth = (): void => {
  if (!containerRef.value) return;
  emit(
    "resize",
    containerRef.value.clientWidth,
    containerRef.value.clientHeight,
  );
};

onMounted(() => {
  updateWidth();
  if (containerRef.value && "ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => updateWidth());
    resizeObserver.observe(containerRef.value);
  }
  window.addEventListener("resize", updateWidth);
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener("resize", updateWidth);
});
</script>

<template>
  <div
    ref="containerRef"
    class="flex-1 h-full min-h-0 overflow-x-auto overflow-y-hidden flex items-stretch transition-colors relative [overscroll-behavior-x:contain] [touch-action:pan-x_pan-y]"
  >
    <Button
      v-if="props.isPreview"
      @click="emit('exitPreview')"
      title="Exit preview (ESC)"
      variant="secondary"
      size="icon"
      class="absolute top-2 right-2 z-50 shadow-lg"
    >
      <div :class="[studioIcons.eyeOff, 'w-5 h-5']" />
    </Button>

    <div
      data-aria-canvas-viewport-surface="true"
      class="relative flex min-h-full shrink-0 justify-center items-stretch rounded-[inherit]"
      :style="outerStyle"
    >
      <div
        data-aria-canvas-slot="true"
        :class="slotClass"
        :style="slotStyle"
      >
        <div
          data-aria-canvas-artboard="true"
          :class="artboardClass"
          :style="artboardStyle"
          @click="emit('artboard-click')"
        >
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
