/**
 * Canvas zoom level as a singleton state shared across components.
 * Used by StageViewport for canvas scaling and viewport chrome.
 */

import {
  ref,
  computed,
  readonly,
  type Ref,
  type ComputedRef,
} from "vue";

import {
  CANVAS_ZOOM_TRANSITION_MS,
  easeOutQuad,
  prefersReducedCanvasMotion,
} from "./canvasZoomMotion";

const MIN_ZOOM = 10 as const;

const MAX_ZOOM = 200 as const;

const DEFAULT_ZOOM = 100 as const;

const DEFAULT_ZOOM_STEP = 10 as const;

const CANVAS_SCALE_MODE_STORAGE_KEY = "aria-canvas-scale-mode";

export type CanvasScaleMode = "fit" | "natural";

export interface SetScaleModeOptions {
  resetZoom?: boolean;
}

export interface SetZoomOptions {
  animate?: boolean;
}

export interface SetZoomAnimatedOptions {
  delta?: number;
  durationMs?: number;
}

const zoom = ref<number>(DEFAULT_ZOOM);

function readStoredScaleMode(): CanvasScaleMode {
  if (typeof window === "undefined") {
    return "fit";
  }

  const stored = window.localStorage.getItem(CANVAS_SCALE_MODE_STORAGE_KEY);
  return stored === "natural" ? "natural" : "fit";
}

const scaleMode = ref<CanvasScaleMode>(readStoredScaleMode());

/** Bumped when fit is requested so StageViewport can re-apply auto-fit */
const fitRequestId = ref(0);

let zoomAnimationFrame: number | null = null;

interface UseZoomReturn {
  readonly zoom: Readonly<Ref<number>>;
  readonly scaleMode: Readonly<Ref<CanvasScaleMode>>;
  readonly zoomDecimal: ComputedRef<number>;
  readonly zoomMultiplier: ComputedRef<number>;
  readonly isMinZoom: ComputedRef<boolean>;
  readonly isMaxZoom: ComputedRef<boolean>;
  readonly isFitMode: ComputedRef<boolean>;
  readonly isNaturalMode: ComputedRef<boolean>;
  readonly setZoom: (value: number, options?: SetZoomOptions) => void;
  readonly setZoomAnimated: (
    target?: number,
    options?: SetZoomAnimatedOptions,
  ) => void;
  readonly zoomIn: (step?: number) => void;
  readonly zoomOut: (step?: number) => void;
  readonly resetZoom: (options?: SetZoomOptions) => void;
  readonly setScaleMode: (
    mode: CanvasScaleMode,
    options?: SetScaleModeOptions,
  ) => void;
  readonly toggleScaleMode: () => void;
  readonly selectZoomPreset: (value: number) => void;
  readonly fitRequestId: Readonly<Ref<number>>;
}

function clampZoomValue(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function cancelZoomAnimation(): void {
  if (zoomAnimationFrame !== null) {
    cancelAnimationFrame(zoomAnimationFrame);
    zoomAnimationFrame = null;
  }
}

/**
 * Canvas zoom state management.
 */
export function useZoom(): UseZoomReturn {
  const zoomDecimal = computed(() => zoom.value / 100);
  const zoomMultiplier = computed(() => 100 / zoom.value);
  const isMinZoom = computed(() => zoom.value <= MIN_ZOOM);
  const isMaxZoom = computed(() => zoom.value >= MAX_ZOOM);
  const isFitMode = computed(() => scaleMode.value === "fit");
  const isNaturalMode = computed(() => scaleMode.value === "natural");

  function applyZoomValue(value: number): void {
    if (typeof value !== "number" || isNaN(value) || !isFinite(value)) {
      console.warn("[useZoom] Invalid zoom value:", value);
      return;
    }

    const oldZoom = zoom.value;
    zoom.value = clampZoomValue(value);

    if (import.meta.env.DEV && oldZoom !== zoom.value) {
      console.debug(`[useZoom] Zoom changed: ${oldZoom}% → ${zoom.value}%`);
    }
  }

  function setZoomAnimated(
    target?: number,
    options: SetZoomAnimatedOptions = {},
  ): void {
    const resolvedTarget = clampZoomValue(
      typeof target === "number"
        ? target
        : zoom.value + (options.delta ?? 0),
    );

    if (prefersReducedCanvasMotion()) {
      cancelZoomAnimation();
      applyZoomValue(resolvedTarget);
      return;
    }

    cancelZoomAnimation();

    const startZoom = zoom.value;
    if (startZoom === resolvedTarget) {
      return;
    }

    const durationMs = options.durationMs ?? CANVAS_ZOOM_TRANSITION_MS;
    const startTime = performance.now();

    const tick = (now: number): void => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = easeOutQuad(progress);
      applyZoomValue(startZoom + (resolvedTarget - startZoom) * eased);

      if (progress < 1) {
        zoomAnimationFrame = requestAnimationFrame(tick);
        return;
      }

      zoomAnimationFrame = null;
      applyZoomValue(resolvedTarget);
    };

    zoomAnimationFrame = requestAnimationFrame(tick);
  }

  function setZoom(value: number, options: SetZoomOptions = {}): void {
    if (options.animate) {
      setZoomAnimated(value);
      return;
    }

    cancelZoomAnimation();
    applyZoomValue(value);
  }

  function persistScaleMode(mode: CanvasScaleMode): void {
    scaleMode.value = mode;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(CANVAS_SCALE_MODE_STORAGE_KEY, mode);
    }
  }

  function enterManualZoom(): void {
    if (scaleMode.value !== "natural") {
      persistScaleMode("natural");
    }
  }

  function zoomIn(step: number = DEFAULT_ZOOM_STEP): void {
    enterManualZoom();
    setZoomAnimated(undefined, { delta: step });
  }

  function zoomOut(step: number = DEFAULT_ZOOM_STEP): void {
    enterManualZoom();
    setZoomAnimated(undefined, { delta: -step });
  }

  function resetZoom(options: SetZoomOptions = {}): void {
    setZoom(DEFAULT_ZOOM, options);
  }

  function setScaleMode(
    mode: CanvasScaleMode,
    options: SetScaleModeOptions = {},
  ): void {
    const resetZoomOnNatural = options.resetZoom ?? true;

    if (scaleMode.value !== mode) {
      persistScaleMode(mode);

      if (mode === "natural" && resetZoomOnNatural) {
        resetZoom({ animate: true });
      }
    }

    if (mode === "fit") {
      fitRequestId.value += 1;
    }
  }

  function toggleScaleMode(): void {
    if (scaleMode.value === "fit") {
      persistScaleMode("natural");
      setZoomAnimated(DEFAULT_ZOOM);
      return;
    }

    setScaleMode("fit");
  }

  function selectZoomPreset(value: number): void {
    enterManualZoom();
    setZoomAnimated(value);
  }

  return {
    zoom: readonly(zoom),
    scaleMode: readonly(scaleMode),
    zoomDecimal,
    zoomMultiplier,
    isMinZoom,
    isMaxZoom,
    isFitMode,
    isNaturalMode,
    setZoom,
    setZoomAnimated,
    zoomIn,
    zoomOut,
    resetZoom,
    setScaleMode,
    toggleScaleMode,
    selectZoomPreset,
    fitRequestId: readonly(fitRequestId),
  };
}
