import { computed, type CSSProperties, type Ref } from "vue";
import type { SiteSettings } from "@/lib/storage/adapter";
import type { UniversalBreakpointItem } from "@/lib/styles/universalDesignSystem";
import {
  DESKTOP_PREVIEW_FALLBACK_WIDTH,
  DESKTOP_PREVIEW_MIN_WIDTH,
  VIEWPORT_HEIGHTS,
  VIEWPORT_WIDTHS,
} from "./pagePreviewConstants";
import type { PagePreviewFrameProps } from "./pagePreviewTypes";
import { usePreviewViewportPresets } from "./usePreviewViewportPresets";
import {
  resolvePreviewPresetCanvasWidth,
  type PreviewViewportPreset,
} from "./previewViewportPresets";

function isPreviewViewportPreset(value: string): value is PreviewViewportPreset {
  return value === "desktop" || value === "tablet" || value === "mobile";
}

function isDefaultViewport(value: string | undefined): boolean {
  return !value || value === "desktop" || value === "base";
}

function fallbackViewportWidth(viewport: string | undefined): number {
  if (viewport && viewport in VIEWPORT_WIDTHS) {
    return VIEWPORT_WIDTHS[viewport as keyof typeof VIEWPORT_WIDTHS];
  }
  return DESKTOP_PREVIEW_FALLBACK_WIDTH;
}

function fallbackViewportHeight(viewport: string | undefined): number {
  if (viewport && viewport in VIEWPORT_HEIGHTS) {
    return VIEWPORT_HEIGHTS[viewport as keyof typeof VIEWPORT_HEIGHTS];
  }
  return VIEWPORT_HEIGHTS.desktop;
}

export interface UsePagePreviewLayoutOptions {
  props: PagePreviewFrameProps;
  containerWidth: Ref<number>;
  containerHeight: Ref<number>;
  siteSettings: Ref<SiteSettings | null>;
  isFrameReady: Ref<boolean>;
  previewViewportPresets: ReturnType<typeof usePreviewViewportPresets>;
}

export function usePagePreviewLayout(options: UsePagePreviewLayoutOptions) {
  const {
    props,
    containerWidth,
    containerHeight,
    isFrameReady,
    previewViewportPresets,
  } = options;

  const isDesktopViewport = computed(() => isDefaultViewport(props.viewport));

  const configuredViewportWidths = computed(() => {
    const configured: readonly UniversalBreakpointItem[] =
      previewViewportPresets.breakpoints.value;
    const byId: Record<string, number | null> = {};
    const widths: number[] = [];

    for (const breakpoint of configured) {
      if (!breakpoint.enabled) continue;
      const id = String(breakpoint.id || "").toLowerCase();
      const canvasWidth = breakpoint.canvasWidth ?? breakpoint.minWidth;
      byId[id] = canvasWidth;

      if (typeof canvasWidth === "number") {
        widths.push(canvasWidth);
      }
    }

    const ordered = [...new Set(widths)].sort((a, b) => a - b);
    if (ordered.length > 0) {
      if (byId.mobile === undefined) byId.mobile = ordered[0];
      if (byId.desktop === undefined) byId.desktop = ordered[ordered.length - 1];

      if (byId.tablet === undefined) {
        byId.tablet =
          ordered.length >= 3
            ? ordered[1]
            : ordered[Math.floor((ordered.length - 1) / 2)];
      }

      if (byId.laptop === undefined) {
        byId.laptop =
          ordered.length >= 2 ? ordered[ordered.length - 2] : byId.desktop;
      }
    }

    return byId;
  });

  const desktopBaseWidth = computed(() => {
    const configuredDesktop = configuredViewportWidths.value.desktop;

    if (typeof configuredDesktop === "number") {
      return Math.max(DESKTOP_PREVIEW_MIN_WIDTH, configuredDesktop);
    }

    const configured = previewViewportPresets.breakpoints.value;
    const largestConfigured = configured
      .filter((bp: UniversalBreakpointItem) => bp.enabled && typeof bp.canvasWidth === "number")
      .map((bp: UniversalBreakpointItem) => bp.canvasWidth as number)
      .sort((a: number, b: number) => b - a)[0];

    const candidate = largestConfigured || DESKTOP_PREVIEW_FALLBACK_WIDTH;
    return Math.max(DESKTOP_PREVIEW_MIN_WIDTH, candidate);
  });

  const viewportWidth = computed(() => {
    if (isDesktopViewport.value) {
      return containerWidth.value || desktopBaseWidth.value;
    }

    const configuredWidth = configuredViewportWidths.value[props.viewport ?? "desktop"];

    if (configuredWidth === null) {
      return containerWidth.value || fallbackViewportWidth(props.viewport);
    }

    return configuredWidth || fallbackViewportWidth(props.viewport);
  });

  const liveScale = computed(() => {
    if (isDesktopViewport.value) return 1;
    if (!containerWidth.value || !viewportWidth.value) return 1;

    return Math.min(1, containerWidth.value / viewportWidth.value);
  });

  const scaledViewportWidth = computed(
    () => viewportWidth.value * liveScale.value,
  );

  const deviceFrameWidth = computed(() => {
    const viewport = props.viewport ?? "desktop";

    if (props.fitToContainer && isPreviewViewportPreset(viewport)) {
      return resolvePreviewPresetCanvasWidth(
        viewport,
        previewViewportPresets.breakpoints.value,
      );
    }

    if (isDefaultViewport(viewport)) {
      return desktopBaseWidth.value;
    }

    const configuredWidth = configuredViewportWidths.value[viewport];
    if (configuredWidth === null) {
      return containerWidth.value || fallbackViewportWidth(viewport);
    }

    return configuredWidth || fallbackViewportWidth(viewport);
  });

  const fitScale = computed(() => {
    if (!props.fitToContainer || !containerWidth.value) {
      return 1;
    }

    const width = deviceFrameWidth.value;
    if (!width) {
      return 1;
    }

    return containerWidth.value / width;
  });

  const fitDeviceFrameHeight = computed(() => {
    const viewport = props.viewport ?? "desktop";

    if (!props.fitToContainer || !containerHeight.value || fitScale.value <= 0) {
      return fallbackViewportHeight(viewport);
    }

    return containerHeight.value / fitScale.value;
  });

  const fitFrameInnerStyle = computed<CSSProperties>(() => ({
    width: `${deviceFrameWidth.value}px`,
    height: `${fitDeviceFrameHeight.value}px`,
    transform: `scale(${fitScale.value})`,
    transformOrigin: "top left",
  }));

  const fitFrameWrapperStyle = computed<CSSProperties>(() => ({
    width: "100%",
    height: containerHeight.value > 0 ? `${containerHeight.value}px` : "100%",
  }));

  const fitIframeStyle = computed<CSSProperties>(() => ({
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
    opacity: isFrameReady.value ? 1 : 0,
    transition: "opacity 120ms ease-out",
    pointerEvents: props.inert ? "none" : "auto",
    userSelect: props.inert ? "none" : "auto",
  }));

  const containerStyle = computed(() => ({
    overflow:
      props.thumbnailFit === "contain" ? ("visible" as const) : ("hidden" as const),
    position: "relative" as const,
    height:
      props.thumbnailFit === "contain" && !props.fitToContainer ? "auto" : "100%",
  }));

  const iframeContainerStyle = computed(() => ({
    width: isDesktopViewport.value ? "100%" : `${scaledViewportWidth.value}px`,
    height: props.thumbnailFit === "contain" ? "auto" : "100%",
    margin: "0 auto",
  }));

  const iframeStyle = computed<CSSProperties>(() => ({
    width: isDesktopViewport.value ? "100%" : `${viewportWidth.value}px`,
    height: `${100 / liveScale.value}%`,
    border: "none",
    transform: isDesktopViewport.value ? "none" : `scale(${liveScale.value})`,
    transformOrigin: isDesktopViewport.value ? "top left" : "top center",
    margin: "0 auto",
    display: "block",
    opacity: isFrameReady.value ? 1 : 0,
    transition: "opacity 120ms ease-out",
    pointerEvents: props.inert ? "none" : "auto",
    userSelect: props.inert ? "none" : "auto",
  }));

  const iframeSandbox = computed(() =>
    props.inert ? "" : "allow-scripts allow-same-origin",
  );

  const imageStyle = computed<CSSProperties>(() => ({
    width: "100%",
    height: props.thumbnailFit === "contain" ? "auto" : "100%",
    display: "block",
    objectFit: props.thumbnailFit,
    objectPosition: props.thumbnailPosition === "top" ? "top center" : "center",
    opacity: isFrameReady.value ? 1 : 0,
    transition: "opacity 120ms ease-out",
    pointerEvents: "none",
    userSelect: "none",
  }));

  const needsResizeObserver = computed(
    () => props.fitToContainer || !isDesktopViewport.value,
  );

  return {
    isDesktopViewport,
    needsResizeObserver,
    containerStyle,
    iframeContainerStyle,
    iframeStyle,
    fitFrameInnerStyle,
    fitFrameWrapperStyle,
    fitIframeStyle,
    imageStyle,
    iframeSandbox,
  };
}
