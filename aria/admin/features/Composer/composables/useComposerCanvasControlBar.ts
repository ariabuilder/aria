import { computed, ref, watch, type ComputedRef } from "vue";
import { useStudioI18n } from "@/i18n";

import { useViewport } from "../../../composables/useViewport";
import { useCanonicalBreakpoints } from "../../../composables/useCanonicalBreakpoints";
import { getBreakpointIconClass } from "../../../composables/breakpointIcons";
import { useZoom } from "../../Stage/composables/useZoom";
import { prefersReducedCanvasMotion } from "../../Stage/composables/canvasZoomMotion";
import { useHistoryState } from "../../History";
import {
  useComposerSavePublishUiState,
  type UseComposerSavePublishUiStateOptions,
} from "./useComposerSavePublishUiState";

export const CANVAS_ZOOM_PRESETS = [50, 75, 100, 125, 150, 200] as const;

export interface UseComposerCanvasControlBarOptions
  extends UseComposerSavePublishUiStateOptions {}

export interface ViewportControlOption {
  id: string;
  label: string;
  icon: string;
  width: number | null;
  tooltip: string;
}

export interface UseComposerCanvasControlBarReturn
  extends ReturnType<typeof useComposerSavePublishUiState> {
  viewport: ReturnType<typeof useViewport>["viewport"];
  setViewport: ReturnType<typeof useViewport>["setViewport"];
  viewportOptions: ComputedRef<ViewportControlOption[]>;
  isViewportStripDisabled: ComputedRef<boolean>;
  zoom: ReturnType<typeof useZoom>["zoom"];
  isFitMode: ReturnType<typeof useZoom>["isFitMode"];
  isMinZoom: ReturnType<typeof useZoom>["isMinZoom"];
  isMaxZoom: ReturnType<typeof useZoom>["isMaxZoom"];
  toggleScaleMode: ReturnType<typeof useZoom>["toggleScaleMode"];
  zoomIn: ReturnType<typeof useZoom>["zoomIn"];
  zoomOut: ReturnType<typeof useZoom>["zoomOut"];
  selectZoomPreset: ReturnType<typeof useZoom>["selectZoomPreset"];
  displayZoom: ComputedRef<number>;
  zoomPresets: typeof CANVAS_ZOOM_PRESETS;
  scaleModeTooltipLabel: ComputedRef<string>;
  isZoomLabelPulsing: ReturnType<typeof ref<boolean>>;
  canUndo: ReturnType<typeof useHistoryState>["canUndo"];
  canRedo: ReturnType<typeof useHistoryState>["canRedo"];
}

function formatViewportWidth(
  width: number | null | undefined,
  fluid: string,
): string {
  if (typeof width === "number" && width > 0) {
    return `${width}px`;
  }

  return fluid;
}

export function useComposerCanvasControlBar(
  options: UseComposerCanvasControlBarOptions,
): UseComposerCanvasControlBarReturn {
  const { t } = useStudioI18n();
  const { viewport, setViewport } = useViewport();
  const { activeViewports } = useCanonicalBreakpoints({ autoLoad: true });
  const {
    zoom,
    isFitMode,
    isMinZoom,
    isMaxZoom,
    toggleScaleMode,
    zoomIn,
    zoomOut,
    selectZoomPreset,
  } = useZoom();
  const { canUndo, canRedo } = useHistoryState();

  const saveState = useComposerSavePublishUiState(options);

  const viewportOptions = computed<ViewportControlOption[]>(() =>
    activeViewports.value.map((option) => ({
      id: option.id,
      label: option.label,
      icon: getBreakpointIconClass({
        id: option.id,
        icon: option.icon,
        width: option.width,
      }),
      width: option.width ?? option.minWidth ?? null,
      tooltip: `${option.label} · ${formatViewportWidth(option.width ?? option.minWidth, t("composer.canvas.fluid"))}`,
    })),
  );

  const isViewportStripDisabled = computed(
    () => saveState.isActionsDisabled.value,
  );

  const displayZoom = computed(() => Math.round(zoom.value));

  const isZoomLabelPulsing = ref(false);
  let zoomLabelPulseTimer: ReturnType<typeof setTimeout> | null = null;

  watch(zoom, (next, previous) => {
    if (previous === undefined || next === previous) {
      return;
    }

    if (prefersReducedCanvasMotion()) {
      return;
    }

    isZoomLabelPulsing.value = true;

    if (zoomLabelPulseTimer) {
      clearTimeout(zoomLabelPulseTimer);
    }

    zoomLabelPulseTimer = setTimeout(() => {
      isZoomLabelPulsing.value = false;
      zoomLabelPulseTimer = null;
    }, 180);
  });

  const scaleModeTooltipLabel = computed(() => {
    if (isFitMode.value) {
      return zoom.value !== 100
        ? t("composer.canvas.actualSizeFromFit", { value: displayZoom.value })
        : t("composer.canvas.actualSize");
    }

    return t("composer.canvas.fitWidth", { value: displayZoom.value });
  });

  return {
    viewport,
    setViewport,
    viewportOptions,
    isViewportStripDisabled,
    zoom,
    isFitMode,
    isMinZoom,
    isMaxZoom,
    toggleScaleMode,
    zoomIn,
    zoomOut,
    selectZoomPreset,
    displayZoom,
    zoomPresets: CANVAS_ZOOM_PRESETS,
    scaleModeTooltipLabel,
    isZoomLabelPulsing,
    canUndo,
    canRedo,
    ...saveState,
  };
}
