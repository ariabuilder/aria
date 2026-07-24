<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useComponentPreviewThumbnail } from "../composables/useComponentPreviewThumbnail";
import ComponentIsolatePreview from "./ComponentIsolatePreview.vue";

const props = withDefaults(
  defineProps<{
    componentId: string;
    thumbnailUrl?: string | null;
    snapshotUrl?: string | null;
    thumbnailRefreshToken?: string | null;
    updatedAt?: string | null;
    eager?: boolean;
    suppressLiveFallback?: boolean;
    thumbnailFit?: "contain" | "cover";
  }>(),
  {
    thumbnailUrl: null,
    snapshotUrl: null,
    thumbnailRefreshToken: null,
    updatedAt: null,
    eager: false,
    suppressLiveFallback: false,
    thumbnailFit: "contain",
  },
);

const isRendered = ref(false);
const hasError = ref(false);
const observerTarget = ref<HTMLElement | null>(null);
let intersectionObserver: IntersectionObserver | null = null;
const hasRequestedLoad = ref(false);

const host = {
  iframeSrc: ref(""),
  iframeSrcDoc: ref(""),
  isRendered,
  hasError,
};

const thumbnail = useComponentPreviewThumbnail({
  props: () => ({
    componentId: props.componentId,
    inert: true,
    thumbnailUrl: props.thumbnailUrl,
    thumbnailRefreshToken: props.thumbnailRefreshToken,
    updatedAt: props.updatedAt,
  }),
  host,
});

const showSkeleton = computed(
  () =>
    !hasError.value &&
    !thumbnail.previewImageSrc.value &&
    (thumbnail.status.value === "loadingCached" ||
      thumbnail.status.value === "regenerating" ||
      thumbnail.status.value === "idle"),
);

const showFallback = computed(
  () =>
    !props.suppressLiveFallback &&
    (hasError.value || thumbnail.status.value === "failed"),
);

const imageClass = computed(() =>
  props.thumbnailFit === "cover"
    ? "h-full w-full object-cover object-center"
    : "max-h-full max-w-full object-contain",
);

async function loadThumbnail(): Promise<void> {
  hasRequestedLoad.value = true;
  await thumbnail.loadThumbnailPreview();
}

function setupObserver(): void {
  teardownObserver();
  const target = observerTarget.value;

  if (!target || typeof IntersectionObserver === "undefined") {
    if (props.eager) {
      void loadThumbnail();
    }
    return;
  }

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && !hasRequestedLoad.value) {
        void loadThumbnail();
      }
    },
    { rootMargin: "250px" },
  );
  intersectionObserver.observe(target);
}

function teardownObserver(): void {
  intersectionObserver?.disconnect();
  intersectionObserver = null;
}

function resetState(): void {
  hasRequestedLoad.value = false;
  thumbnail.clearThumbnailState();
}

watch(
  () =>
    [
      props.componentId,
      props.thumbnailUrl,
      props.thumbnailRefreshToken,
      props.updatedAt,
    ] as const,
  () => {
    resetState();
    setupObserver();
    if (props.eager) {
      void loadThumbnail();
    }
  },
);

onBeforeUnmount(() => {
  teardownObserver();
  thumbnail.releasePreviewObjectUrl();
});

onMounted(() => {
  setupObserver();
  if (props.eager) {
    void loadThumbnail();
  }
});
</script>

<template>
  <div ref="observerTarget" class="relative h-full w-full">
    <div
      v-if="showSkeleton"
      class="absolute inset-0 animate-pulse rounded-sm bg-muted/40"
    />

    <div
      v-else-if="showFallback"
      class="absolute inset-0 bg-muted/20"
    >
      <ComponentIsolatePreview
        :component-id="componentId"
        :snapshot-url="snapshotUrl"
        eager
        class="h-full w-full"
      />
    </div>

    <div
      v-else-if="thumbnail.previewImageSrc.value"
      class="flex h-full w-full items-center justify-center overflow-hidden"
    >
      <img
        :src="thumbnail.previewImageSrc.value"
        :class="imageClass"
        alt=""
        decoding="async"
        @error="thumbnail.handlePreviewImageError"
      >
    </div>
  </div>
</template>
