<script setup lang="ts">
import { computed, ref } from "vue";
import { studioIcons } from "@/lib/icons";
import type { PagePreviewFrameProps } from "../composables/pagePreviewTypes";
import { usePreviewViewportPresets } from "../composables/usePreviewViewportPresets";
import { usePagePreviewThumbnail } from "../composables/usePagePreviewThumbnail";
import { usePagePreviewLayout } from "../composables/usePagePreviewLayout";
import { usePagePreviewLoader } from "../composables/usePagePreviewLoader";
import { usePagePreviewVisibility } from "../composables/usePagePreviewVisibility";

const props = withDefaults(defineProps<PagePreviewFrameProps>(), {
  itemType: "page",
  viewport: "desktop",
  inert: false,
  eager: false,
  skipObserver: false,
  fitToContainer: false,
  thumbnailFit: "cover",
  thumbnailPosition: "center",
});

const previewViewportPresets = usePreviewViewportPresets({
  autoLoad: props.fitToContainer,
});

const iframeSrc = ref("");
const iframeSrcDoc = ref("");
const isRendered = ref(false);
const hasError = ref(false);
const isFrameReady = ref(false);

const host = {
  iframeSrc,
  iframeSrcDoc,
  isRendered,
  hasError,
  isFrameReady,
};

const containerWidth = ref(0);
const containerHeight = ref(0);
const iframeRef = ref<HTMLIFrameElement | null>(null);

const thumbnail = usePagePreviewThumbnail({ props, host });
const loader = usePagePreviewLoader({ props, host, thumbnail });
const layout = usePagePreviewLayout({
  props,
  containerWidth,
  containerHeight,
  siteSettings: loader.siteSettings,
  isFrameReady,
  previewViewportPresets,
});

const {
  containerStyle,
  iframeContainerStyle,
  iframeStyle,
  fitFrameInnerStyle,
  fitFrameWrapperStyle,
  fitIframeStyle,
  imageStyle,
  iframeSandbox,
} = layout;

const { previewImageSrc, handlePreviewImageError, releasePreviewObjectUrl } =
  thumbnail;

const {
  isLoading,
  handleIframeLoad,
  usesThumbnailImagePreview,
  loadPreview,
  resetPreviewState,
} = loader;

const visibility = usePagePreviewVisibility({
  props,
  needsResizeObserver: layout.needsResizeObserver,
  containerWidth,
  containerHeight,
  iframeRef,
  onLoadPreview: () => {
    void loadPreview();
  },
  onReload: (options) => {
    const keepImage =
      options?.keepImage ??
      !!(usesThumbnailImagePreview.value && previewImageSrc.value);
    resetPreviewState(keepImage);
  },
  onReleaseThumbnail: () => {
    releasePreviewObjectUrl();
  },
});

const showSkeleton = computed(
  () =>
    !hasError.value &&
    !previewImageSrc.value &&
    (isLoading.value || (isRendered.value && !isFrameReady.value)),
);
</script>

<template>
  <div
    :ref="visibility.setContainerRef"
    :style="containerStyle"
    :class="[
      'relative w-full h-full rounded-sm overflow-hidden border border-solid border-border/50',
      props.class,
    ]"
  >
    <transition name="preview-fade">
      <div v-if="showSkeleton" class="absolute inset-0 z-10 p-3 bg-muted">
        <div
          class="h-full w-full rounded-md border border-border bg-background/60 animate-pulse"
        />
      </div>
    </transition>

    <!-- Error State -->
    <div
      v-if="hasError && !showSkeleton"
      class="absolute inset-0 flex items-center justify-center bg-muted/80"
    >
      <div class="text-center px-4">
        <div
          :class="[
            studioIcons.dangerTriangle,
            'w-6 h-6 text-muted-foreground/50 mx-auto mb-1',
          ]"
          aria-hidden="true"
        />
        <span class="block text-xs text-muted-foreground"
          >Preview unavailable</span
        >
        <span
          class="block mt-1 text-[10px] uppercase tracking-widest text-muted-foreground/70"
        >
          Snapshot pending
        </span>
      </div>
    </div>

    <!-- Empty State (before loading) -->
    <div
      v-if="!showSkeleton && !hasError && !isRendered"
      class="absolute inset-0 flex items-center justify-center bg-muted"
    >
      <div
        :class="[studioIcons.page, 'w-8 h-8 text-muted-foreground/30']"
        aria-hidden="true"
      />
    </div>

    <!-- Preview iframe container -->
    <div
      v-show="(isRendered || previewImageSrc) && !hasError"
      :style="fitToContainer ? undefined : iframeContainerStyle"
      class="absolute inset-0 flex items-start justify-center overflow-hidden"
    >
      <img
        v-if="previewImageSrc"
        :src="previewImageSrc"
        :style="imageStyle"
        class="thumbnail-swap"
        alt="Page thumbnail preview"
        decoding="async"
        @load="handleIframeLoad"
        @error="handlePreviewImageError"
      />
      <div
        v-else-if="fitToContainer"
        class="w-full shrink-0 overflow-hidden bg-sidebar"
        :style="fitFrameWrapperStyle"
      >
        <div :style="fitFrameInnerStyle">
          <iframe
            :ref="visibility.setIframeRef"
            :src="iframeSrc || undefined"
            :srcdoc="iframeSrcDoc || undefined"
            :style="fitIframeStyle"
            :sandbox="iframeSandbox"
            @load="handleIframeLoad"
            title="Page Preview"
          />
        </div>
      </div>
      <iframe
        v-else
        :ref="visibility.setIframeRef"
        :src="iframeSrc || undefined"
        :srcdoc="iframeSrcDoc || undefined"
        :style="iframeStyle"
        :sandbox="iframeSandbox"
        @load="handleIframeLoad"
        title="Page Preview"
      />
    </div>
  </div>
</template>

<style scoped>
.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 120ms ease-out;
}

.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}

.thumbnail-swap {
  transition: opacity 200ms ease-out;
}
</style>
