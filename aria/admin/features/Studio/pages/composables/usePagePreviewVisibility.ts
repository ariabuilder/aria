import {
  onMounted,
  onUnmounted,
  ref,
  watch,
  type ComponentPublicInstance,
  type ComputedRef,
  type Ref,
} from "vue";
import type { PagePreviewFrameProps } from "./pagePreviewTypes";

export interface PagePreviewReloadOptions {
  /** When false, drop the current thumbnail image before reloading. */
  keepImage?: boolean;
}

export interface UsePagePreviewVisibilityOptions {
  props: PagePreviewFrameProps;
  needsResizeObserver: ComputedRef<boolean>;
  containerWidth: Ref<number>;
  containerHeight: Ref<number>;
  iframeRef: Ref<HTMLIFrameElement | null>;
  onLoadPreview: () => void;
  onReload: (options?: PagePreviewReloadOptions) => void;
  onReleaseThumbnail: () => void;
}

export function usePagePreviewVisibility(
  options: UsePagePreviewVisibilityOptions,
) {
  const {
    props,
    needsResizeObserver,
    containerWidth,
    containerHeight,
    iframeRef,
    onLoadPreview,
    onReload,
    onReleaseThumbnail,
  } = options;

  const containerRef = ref<HTMLElement | null>(null);
  const isVisible = ref(false);

  let observer: IntersectionObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let hasMounted = false;

  function setContainerRef(
    value: Element | ComponentPublicInstance | null,
  ): void {
    containerRef.value = value instanceof HTMLElement ? value : null;
  }

  function setIframeRef(value: Element | ComponentPublicInstance | null): void {
    iframeRef.value = value instanceof HTMLIFrameElement ? value : null;
  }

  function setupObserver(): void {
    if (props.eager || props.skipObserver) {
      isVisible.value = true;
      void onLoadPreview();
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      isVisible.value = true;
      void onLoadPreview();
      return;
    }

    if (!containerRef.value) return;

    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !isVisible.value) {
          isVisible.value = true;
          onLoadPreview();
        }
      },
      {
        rootMargin: "250px",
        threshold: 0,
      },
    );

    observer.observe(containerRef.value);
  }

  function setupResizeObserver(): void {
    if (!containerRef.value || !needsResizeObserver.value) return;

    const updateSize = () => {
      containerWidth.value = containerRef.value?.clientWidth || 0;
      containerHeight.value = containerRef.value?.clientHeight || 0;
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(containerRef.value);
  }

  function cleanupResizeObserver(): void {
    if (!resizeObserver) {
      return;
    }

    resizeObserver.disconnect();
    resizeObserver = null;
  }

  function cleanupObserver(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    cleanupResizeObserver();
  }

  onMounted(() => {
    hasMounted = true;
    setupObserver();
    setupResizeObserver();
  });

  onUnmounted(() => {
    cleanupObserver();
    onReleaseThumbnail();

    const iframe = iframeRef.value;
    const doc = iframe?.contentDocument;
    if (doc) {
      const videos = doc.querySelectorAll("video");
      videos.forEach((video) => {
        try {
          video.pause();
        } catch {
          // iframe may be cross-origin or already destroyed
        }
      });
    }
  });

  watch(needsResizeObserver, (needsObserver) => {
    if (needsObserver) {
      cleanupResizeObserver();
      setupResizeObserver();
      return;
    }

    containerWidth.value = 0;
    containerHeight.value = 0;
    cleanupResizeObserver();
  });

  watch(
    () => [props.viewport, props.fitToContainer],
    () => {
      if (!needsResizeObserver.value || !containerRef.value) {
        return;
      }

      containerWidth.value = containerRef.value.clientWidth || 0;
      containerHeight.value = containerRef.value.clientHeight || 0;
    },
  );

  watch(
    () => [
      props.pageSlug,
      props.pageStatus,
      props.snapshotUrl,
      props.snapshotRefreshToken,
      props.thumbnailUrl,
      props.thumbnailRefreshToken,
      props.itemType,
      props.inert,
    ],
    (current, previous) => {
      if (!hasMounted) {
        return;
      }

      const thumbnailSourceChanged =
        previous !== undefined &&
        (current[4] !== previous[4] || current[5] !== previous[5]);

      onReload({ keepImage: thumbnailSourceChanged ? false : undefined });

      if (isVisible.value) {
        void onLoadPreview();
      }
    },
  );

  return {
    containerRef,
    isVisible,
    setContainerRef,
    setIframeRef,
  };
}
