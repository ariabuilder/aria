<!-- Stage viewport: zoom, responsive frame, and preview iframe slot. -->
<template>
  <div
    class="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden font-sans transition-colors text-foreground rounded-[inherit]"
    style="view-transition-name: composer-root"
  >
    <div class="h-full w-full">
      <div
        :class="canvasContainerClass"
        :style="
          transitionTargetSlug
            ? { viewTransitionName: transitionTargetName }
            : undefined
        "
        @click="emit('background-click')"
      >
        <CanvasViewportFrame
          :is-preview="isPreview"
          :canvas-style="canvasStyle"
          :scale="canvasScale"
          :has-initial-load="hasInitialLoad"
          :background="'var(--background)'"
          :viewport="viewport as ViewportType"
          @resize="handleCanvasResize"
          @artboard-click="emit('background-click')"
          @exit-preview="togglePreview"
        >
          <slot name="canvas"></slot>
        </CanvasViewportFrame>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  onMounted,
  onBeforeUnmount,
  computed,
  ref,
  provide,
  watch,
  nextTick,
  type ComputedRef,
} from "vue";
import { usePreview } from "../composables/usePreview";
import { useViewTransitions } from "../../Core/composables/useViewTransitions";
import { useViewport } from "../../../composables/useViewport";
import { useResponsiveTarget } from "../../../composables/useResponsiveTarget";
import { useZoom } from "../composables/useZoom";
import { useCanonicalBreakpoints } from "../../../composables/useCanonicalBreakpoints";
import { DEFAULT_DESKTOP_CANVAS_WIDTH } from "../../../../lib/styles/responsiveBreakpoints";
import { computeCanvasFitZoom } from "../utils/canvasFitZoom";
import type { ViewportType } from "../types/index";
import type { LayoutDSL, PageDSL } from "../../../../lib/types/nodes";
import CanvasViewportFrame from "./CanvasViewportFrame.vue";

interface Props {
  page?: PageDSL | null;
  showOutlines?: boolean;
  wireframeMode?: boolean;
  currentLayout?: LayoutDSL | null;
  onToggleLeftSidebar?: () => void;
  onToggleRightSidebar?: () => void;
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  isLoading?: boolean;
  disableCanvasScaling?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showOutlines: false,
  wireframeMode: false,
  currentLayout: null,
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  isLoading: false,
});
const emit = defineEmits<{
  undo: [];
  redo: [];
  ready: [];
  "background-click": [];
}>();

const { isPreview, togglePreview } = usePreview();
const { transitionTargetSlug, transitionTargetName } = useViewTransitions();
const { viewport } = useViewport();
const { hasOverrideTarget } = useResponsiveTarget();
const { activeViewports } = useCanonicalBreakpoints({ autoLoad: true });

const { zoom, setZoom, scaleMode, fitRequestId } = useZoom();

const hasInitialLoad = ref<boolean>(false);
const hasEmittedReady = ref<boolean>(false);
const canvasContainerSize = ref<{ width: number; height: number } | null>(
  null,
);
const canvasContentSize = ref<{ width: number | null; height: number | null }>(
  {
    width: null,
    height: null,
  },
);

const canvasScale: ComputedRef<number> = computed(() => zoom.value / 100);

provide("canvasScale", canvasScale);
provide(
  "setCanvasContentSize",
  (size: { width: number | null; height: number | null }): void => {
    canvasContentSize.value = size;
  },
);

const resolvedViewportWidths = computed<Record<string, number | null>>(() => {
  const fallbackWidths: Record<string, number | null> = {
    base: DEFAULT_DESKTOP_CANVAS_WIDTH,
    tablet: 768,
    desktop: 1280,
    laptop: 1024,
    mobile: 375,
  };

  const explicitWidths = activeViewports.value
    .map((viewportDef) => viewportDef.width)
    .filter((width): width is number => typeof width === "number" && width > 0);

  const desktopFallbackWidth = Math.max(
    fallbackWidths.desktop ?? 1280,
    explicitWidths.length > 0 ? Math.max(...explicitWidths) : 0,
  );

  const resolved = { ...fallbackWidths };

  for (const viewportDef of activeViewports.value) {
    const viewportName = viewportDef.id;

    resolved[viewportName] =
      typeof viewportDef.width === "number" && viewportDef.width > 0
        ? viewportDef.width
        : viewportName === "desktop"
          ? desktopFallbackWidth
          : (resolved[viewportName] ?? viewportDef.minWidth ?? null);
  }

  return resolved;
});

const currentViewportWidth = computed<number | null>(() => {
  const currentViewport = activeViewports.value.find(
    (vp) => vp.id === viewport.value,
  );

  if (
    currentViewport &&
    typeof currentViewport.width === "number" &&
    currentViewport.width > 0
  ) {
    return currentViewport.width;
  }

  return resolvedViewportWidths.value[viewport.value] ?? null;
});

const fitTargetWidth = computed<number | null>(() => currentViewportWidth.value);

const effectiveViewportWidth = computed<number | null>(
  () => currentViewportWidth.value,
);

const canvasStyle: ComputedRef<Record<string, string>> = computed(() => {
  const width = effectiveViewportWidth.value
    ? `${effectiveViewportWidth.value}px`
    : "100%";

  const maxWidth = effectiveViewportWidth.value
    ? `${effectiveViewportWidth.value}px`
    : "none";

  return {
    width,
    maxWidth,
    transform: "none",
    transformOrigin: "top center",
  };
});

const canvasContainerClass = computed(() => [
  "flex h-full items-stretch justify-center overflow-hidden min-w-0 relative",
  {
    "stage-viewport-targeted": !isPreview && hasOverrideTarget.value,
  },
]);

const handleCanvasResize = (width: number, height: number): void => {
  canvasContainerSize.value = { width, height };
};

const getFitZoom = (): number => {
  return computeCanvasFitZoom({
    scaleMode: scaleMode.value,
    disableCanvasScaling: props.disableCanvasScaling,
    containerWidth: canvasContainerSize.value?.width ?? null,
    fitTargetWidth: fitTargetWidth.value,
  });
};

const applyAutoFit = (): void => {
  if (props.disableCanvasScaling) return;

  const nextZoom = getFitZoom();

  if (Math.round(zoom.value) === nextZoom) return;

  setZoom(nextZoom);
};

onMounted(() => {
  const handleEsc = (e: KeyboardEvent) => {
    if (isPreview.value && (e.key === "Escape" || e.key === "Esc")) {
      togglePreview();
    }
  };
  window.addEventListener("keydown", handleEsc);

  setTimeout(() => {
    hasInitialLoad.value = true;
  }, 100);

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleEsc);
  });
});

watch(
  () => [props.isLoading, hasInitialLoad.value],
  async ([isLoading, initialLoaded]) => {
    if (hasEmittedReady.value || isLoading || !initialLoaded) return;

    await nextTick();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!hasEmittedReady.value) {
          hasEmittedReady.value = true;
          emit("ready");
        }
      });
    });
  },
  { immediate: true },
);

watch(
  () => [
    canvasContainerSize.value,
    fitTargetWidth.value,
    viewport.value,
    scaleMode.value,
    fitRequestId.value,
  ],
  () => {
    applyAutoFit();
  },
  { immediate: true, deep: true },
);
</script>
