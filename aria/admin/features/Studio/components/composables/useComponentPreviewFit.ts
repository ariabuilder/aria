import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  type CSSProperties,
  type Ref,
} from "vue";

import { COMPONENT_PREVIEW_ROOT_SELECTOR } from "./componentPreviewConstants";

const FIT_RETRY_DELAYS_MS = [0, 100, 400] as const;

export interface UseComponentPreviewFitOptions {
  iframeRef: Ref<HTMLIFrameElement | null>;
  wellRef: Ref<HTMLElement | null>;
  enabled: Ref<boolean>;
  frameWidth: Ref<number>;
}

export function useComponentPreviewFit(options: UseComponentPreviewFitOptions) {
  const { iframeRef, wellRef, enabled, frameWidth } = options;

  const containerWidth = ref(0);
  const containerHeight = ref(0);
  const contentHeight = ref(0);
  let resizeObserver: ResizeObserver | null = null;
  let fitRetryTimer: ReturnType<typeof setTimeout> | null = null;

  function clearFitRetryTimer(): void {
    if (fitRetryTimer) {
      clearTimeout(fitRetryTimer);
      fitRetryTimer = null;
    }
  }

  function resetFit(): void {
    containerWidth.value = 0;
    containerHeight.value = 0;
    contentHeight.value = 0;
  }

  function measureContainer(): void {
    const well = wellRef.value;
    if (!well) {
      containerWidth.value = 0;
      containerHeight.value = 0;
      return;
    }

    containerWidth.value = Math.max(well.clientWidth, 1);
    containerHeight.value = Math.max(well.clientHeight, 1);
  }

  function measureContentHeight(): void {
    const doc = iframeRef.value?.contentDocument;
    const root = doc?.querySelector(COMPONENT_PREVIEW_ROOT_SELECTOR);

    if (!(root instanceof HTMLElement) || !doc?.body) {
      contentHeight.value = 0;
      return;
    }

    const measuredHeight = Math.max(
      root.scrollHeight,
      root.offsetHeight,
      root.getBoundingClientRect().height,
      doc.body.scrollHeight,
      doc.documentElement.scrollHeight,
      1,
    );

    contentHeight.value = measuredHeight;
  }

  const fitScale = computed(() => {
    if (!enabled.value) {
      return 1;
    }

    const width = frameWidth.value;
    const height = contentHeight.value;
    if (!width || !containerWidth.value || !containerHeight.value) {
      return 1;
    }

    const frameHeight = height > 0 ? height : width * 0.5625;
    const nextScale = Math.min(
      containerWidth.value / width,
      containerHeight.value / frameHeight,
      1,
    );

    return Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1;
  });

  const frameInnerStyle = computed<CSSProperties>(() => ({
    width: `${frameWidth.value}px`,
    height: `${contentHeight.value > 0 ? contentHeight.value : frameWidth.value * 0.5625}px`,
    flex: "0 0 auto",
    transform: `scale(${fitScale.value})`,
    transformOrigin: "top center",
  }));

  const frameWrapperStyle = computed<CSSProperties>(() => ({
    width: "100%",
    height: containerHeight.value > 0 ? `${containerHeight.value}px` : "100%",
    display: "flex",
    justifyContent: "center",
    overflow: "hidden",
  }));

  const iframeStyle = computed<CSSProperties>(() => ({
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
  }));

  function measureAndFit(): void {
    if (!enabled.value) {
      resetFit();
      return;
    }

    measureContainer();
    measureContentHeight();
  }

  async function scheduleFit(): Promise<void> {
    clearFitRetryTimer();
    await nextTick();
    measureAndFit();

    window.requestAnimationFrame(() => {
      measureAndFit();
    });

    for (const delay of FIT_RETRY_DELAYS_MS) {
      if (delay === 0) {
        continue;
      }

      fitRetryTimer = setTimeout(() => {
        measureAndFit();
      }, delay);
    }
  }

  function attachResizeObserver(): void {
    detachResizeObserver();
    const well = wellRef.value;
    if (!well || typeof ResizeObserver === "undefined") {
      return;
    }

    resizeObserver = new ResizeObserver(() => {
      measureAndFit();
    });
    resizeObserver.observe(well);
  }

  function detachResizeObserver(): void {
    resizeObserver?.disconnect();
    resizeObserver = null;
  }

  onBeforeUnmount(() => {
    clearFitRetryTimer();
    detachResizeObserver();
  });

  return {
    containerWidth,
    containerHeight,
    contentHeight,
    fitScale,
    frameInnerStyle,
    frameWrapperStyle,
    iframeStyle,
    measureAndFit,
    scheduleFit,
    attachResizeObserver,
    detachResizeObserver,
    resetFit,
  };
}
