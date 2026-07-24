<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { studioIcons } from "@/lib/icons";
import type { PreviewViewportPreset } from "@/features/Studio/pages/composables/previewViewportPresets";
import { usePreviewViewportPresets } from "@/features/Studio/pages/composables/usePreviewViewportPresets";
import { useComponentIsolatePreview } from "../composables/useComponentIsolatePreview";
import { useComponentPreviewFit } from "../composables/useComponentPreviewFit";

const props = withDefaults(
  defineProps<{
    componentId: string;
    eager?: boolean;
    viewport?: PreviewViewportPreset;
    snapshotUrl?: string | null;
    snapshotRefreshToken?: string | null;
  }>(),
  {
    eager: false,
    viewport: "desktop",
    snapshotUrl: null,
    snapshotRefreshToken: null,
  },
);

const iframeSrc = ref("");
const iframeSrcDoc = ref("");
const isRendered = ref(false);
const hasError = ref(false);
const isFrameReady = ref(false);
const iframeRef = ref<HTMLIFrameElement | null>(null);
const wellRef = ref<HTMLElement | null>(null);
const observerTarget = ref<HTMLElement | null>(null);
let intersectionObserver: IntersectionObserver | null = null;

const host = {
  iframeSrc,
  iframeSrcDoc,
  isRendered,
  hasError,
  isFrameReady,
};

const previewViewportPresets = usePreviewViewportPresets({ autoLoad: true });

const frameWidth = computed(() =>
  previewViewportPresets.getPresetFrameWidth(props.viewport),
);

const preview = useComponentIsolatePreview({
  props: {
    componentId: props.componentId,
    snapshotUrl: props.snapshotUrl,
    snapshotRefreshToken: props.snapshotRefreshToken,
  },
  frameWidth,
  host,
});

const enabled = computed(() => isRendered.value);

const fit = useComponentPreviewFit({
  iframeRef,
  wellRef,
  enabled,
  frameWidth,
});
const { frameWrapperStyle, frameInnerStyle, iframeStyle } = fit;

const showSkeleton = computed(
  () => preview.isLoading.value || (!isRendered.value && !hasError.value),
);

async function loadVisiblePreview(): Promise<void> {
  await preview.loadPreview();
}

function setupObserver(): void {
  teardownObserver();
  const target = observerTarget.value;
  if (!target || typeof IntersectionObserver === "undefined") {
    if (props.eager) {
      void loadVisiblePreview();
    }
    return;
  }

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting) {
        void loadVisiblePreview();
      }
    },
    { rootMargin: "120px" },
  );
  intersectionObserver.observe(target);
}

function teardownObserver(): void {
  intersectionObserver?.disconnect();
  intersectionObserver = null;
}

watch(
  () => [props.componentId, props.viewport] as const,
  () => {
    preview.resetPreviewState();
    setupObserver();
    if (props.eager) {
      void loadVisiblePreview();
    }
  },
);

watch(frameWidth, (nextWidth, previousWidth) => {
  if (nextWidth === previousWidth) {
    return;
  }

  preview.refreshFrameLayout();
  if (isFrameReady.value) {
    void fit.scheduleFit();
  }
});

watch(
  () => [frameWidth.value, isFrameReady.value] as const,
  () => {
    if (isFrameReady.value) {
      void fit.scheduleFit();
    }
  },
);

watch(isFrameReady, (ready) => {
  if (ready) {
    void fit.scheduleFit();
    fit.attachResizeObserver();
  }
});

onBeforeUnmount(() => {
  teardownObserver();
  fit.detachResizeObserver();
  preview.releasePreviewObjectUrl();
});

setupObserver();
</script>

<template>
  <div ref="observerTarget" class="relative h-full w-full">
    <div
      v-if="showSkeleton"
      class="absolute inset-0 animate-pulse rounded-sm bg-muted/40"
    />

    <div
      v-else-if="hasError"
      class="absolute inset-0 flex items-center justify-center text-muted-foreground"
    >
      <span :class="[studioIcons.media, 'size-5 opacity-50']" />
    </div>

    <div
      v-else-if="isRendered"
      ref="wellRef"
      class="relative flex h-full w-full items-start justify-center overflow-hidden"
    >
      <div class="w-full shrink-0 overflow-hidden" :style="frameWrapperStyle">
        <div :style="frameInnerStyle">
          <iframe
            ref="iframeRef"
            :src="iframeSrc || undefined"
            :srcdoc="iframeSrcDoc || undefined"
            :style="iframeStyle"
            sandbox="allow-scripts allow-same-origin"
            title="Component preview"
            @load="
              () => {
                preview.handleIframeLoad();
                void fit.scheduleFit();
              }
            "
          />
        </div>
      </div>
    </div>
  </div>
</template>
