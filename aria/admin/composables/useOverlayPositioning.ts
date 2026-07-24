import { ref, computed, readonly, onBeforeUnmount, type Ref } from "vue";
import {
  computePosition,
  autoUpdate,
  offset,
  flip,
  shift,
  type Placement,
  type Strategy,
  type Middleware,
} from "@floating-ui/dom";

interface OverlayPositioningOptions {
  /**
   * Placement preference for the overlay.
   * @default 'top-start'
   */
  placement?: Placement;

  /**
   * CSS positioning strategy.
   * @default 'absolute'
   */
  strategy?: Strategy;

  /**
   * Offset from target element in pixels.
   * @default 0
   */
  offset?: number;

  /**
   * Enable collision detection (flip/shift).
   * @default true
   */
  detectCollision?: boolean;

  /**
   * Padding for shift middleware (viewport edge distance).
   * @default 8
   */
  shiftPadding?: number;

  /**
   * Enable animation frame updates for ultra-smooth tracking.
   * Higher CPU usage but smoother positioning.
   * @default false
   */
  animationFrame?: boolean;

  /**
   * Enable debug logging for positioning operations.
   * @default false
   */
  debug?: boolean;
}

interface OverlayPosition {
  top: number;
  left: number;
  strategy: Strategy;
  /** Final placement after collision detection */
  placement?: Placement;
}

interface AutoUpdateConfig {
  ancestorScroll: boolean;
  ancestorResize: boolean;
  elementResize: boolean;
  layoutShift: boolean;
  animationFrame: boolean;
}

const DEFAULT_PLACEMENT: Placement = "top-start";

const DEFAULT_STRATEGY: Strategy = "absolute";

const DEFAULT_OFFSET = 0;

const DEFAULT_SHIFT_PADDING = 8;

const DEFAULT_AUTO_UPDATE_CONFIG: AutoUpdateConfig = {
  ancestorScroll: true,
  ancestorResize: true,
  elementResize: true,
  layoutShift: true,
  animationFrame: false,
};

/**
 * Validates that an element ref is ready for positioning.
 *
 * @param element - Element ref to validate
 * @returns True if element exists and is mounted
 */
function isElementReady(element: Ref<HTMLElement | null>): boolean {
  return element.value !== null && element.value instanceof HTMLElement;
}

/**
 * Validates that both target and overlay are ready.
 *
 * @param target - Target element ref
 * @param overlay - Overlay element ref
 * @returns True if both elements are ready
 */
function areBothElementsReady(
  target: Ref<HTMLElement | null>,
  overlay: Ref<HTMLElement | null>,
): boolean {
  return isElementReady(target) && isElementReady(overlay);
}

/**
 * Floating UI positioning for selection overlays, tooltips, and popovers.
 * Tracks sticky/fixed/transformed targets and updates on scroll/resize.
 *
 * @param targetElement - Element to position relative to
 * @param overlayElement - Overlay element to position
 * @param options - Configuration options
 */
export function useOverlayPositioning(
  targetElement: Ref<HTMLElement | null>,
  overlayElement: Ref<HTMLElement | null>,
  options: OverlayPositioningOptions = {},
) {
  const {
    placement = DEFAULT_PLACEMENT,
    strategy = DEFAULT_STRATEGY,
    offset: offsetValue = DEFAULT_OFFSET,
    detectCollision = true,
    shiftPadding = DEFAULT_SHIFT_PADDING,
    animationFrame = false,
    debug = false,
  } = options;

  /**
   * Current computed position of the overlay.
   * Null when elements are not ready.
   */
  const overlayPosition = ref<OverlayPosition | null>(null);

  /**
   * Cleanup function for auto-update subscription.
   * Null when not tracking.
   */
  let cleanupAutoUpdate: (() => void) | null = null;

  /**
   * Whether positioning is currently being tracked.
   */
  const isTracking = ref(false);

  /**
   * Last error encountered during positioning.
   */
  const error = ref<Error | null>(null);

  /**
   * Whether both target and overlay elements are ready.
   */
  const isReady = computed<boolean>(() => {
    return areBothElementsReady(targetElement, overlayElement);
  });

  /**
   * Whether overlay has a valid computed position.
   */
  const hasPosition = computed<boolean>(() => {
    return overlayPosition.value !== null;
  });

  /**
   * Current top coordinate (or 0 if no position).
   */
  const top = computed<number>(() => {
    return overlayPosition.value?.top ?? 0;
  });

  /**
   * Current left coordinate (or 0 if no position).
   */
  const left = computed<number>(() => {
    return overlayPosition.value?.left ?? 0;
  });

  /**
   * Current positioning strategy.
   */
  const currentStrategy = computed<Strategy>(() => {
    return overlayPosition.value?.strategy ?? strategy;
  });

  /**
   * Configuration status summary.
   */
  const config = computed(() => ({
    placement,
    strategy,
    offset: offsetValue,
    detectCollision,
    shiftPadding,
    animationFrame,
  }));

  /**
   * Builds middleware array based on options.
   *
   * @returns Array of Floating UI middleware
   */
  function buildMiddleware(): Middleware[] {
    const middleware: Middleware[] = [offset(offsetValue)];

    if (detectCollision) {
      middleware.push(
        flip(), // Flip to opposite side if insufficient space
        shift({ padding: shiftPadding }), // Shift to stay within viewport
      );
    }

    return middleware;
  }

  /**
   * Calculates and updates overlay position using Floating UI.
   * Applies styles directly to overlay element.
   *
   * @returns True if position was successfully updated
   *
   * @example
   * ```ts
   * const success = await updatePosition();
   * if (!success) {
   *   console.error('Failed to update overlay position');
   * }
   * ```
   */
  async function updatePosition(): Promise<boolean> {
    if (!areBothElementsReady(targetElement, overlayElement)) {
      overlayPosition.value = null;

      if (debug) {
        console.warn(
          "[useOverlayPositioning] Elements not ready for positioning",
        );
      }

      return false;
    }

    try {
      const middleware = buildMiddleware();

      const result = await computePosition(
        targetElement.value!,
        overlayElement.value!,
        {
          placement,
          strategy,
          middleware,
        },
      );

      const {
        x,
        y,
        strategy: computedStrategy,
        placement: finalPlacement,
      } = result;

      overlayPosition.value = {
        top: y,
        left: x,
        strategy: computedStrategy,
        placement: finalPlacement,
      };

      // Apply styles to overlay element
      if (overlayElement.value) {
        Object.assign(overlayElement.value.style, {
          position: computedStrategy,
          left: `${x}px`,
          top: `${y}px`,
        });
      }

      error.value = null;

      if (debug) {
        console.log("[useOverlayPositioning] Position updated:", {
          x,
          y,
          strategy: computedStrategy,
          placement: finalPlacement,
        });
      }

      return true;
    } catch (err) {
      const positioningError =
        err instanceof Error
          ? err
          : new Error("Failed to compute overlay position");

      error.value = positioningError;
      overlayPosition.value = null;

      console.error(
        "[useOverlayPositioning] Position calculation failed:",
        err,
      );

      return false;
    }
  }

  /**
   * Starts automatic position tracking.
   * Updates position on scroll, resize, and DOM changes.
   *
   * @returns True if tracking started successfully
   *
   * @example
   * ```ts
   * const started = startTracking();
   * if (started) {
   *   console.log('Position tracking active');
   * }
   * ```
   */
  function startTracking(): boolean {
    if (!areBothElementsReady(targetElement, overlayElement)) {
      if (debug) {
        console.warn(
          "[useOverlayPositioning] Cannot start tracking: elements not ready",
        );
      }
      return false;
    }

    if (cleanupAutoUpdate) {
      stopTracking();
    }

    try {
      const autoUpdateConfig: AutoUpdateConfig = {
        ...DEFAULT_AUTO_UPDATE_CONFIG,
        animationFrame,
      };

      cleanupAutoUpdate = autoUpdate(
        targetElement.value!,
        overlayElement.value!,
        updatePosition,
        autoUpdateConfig,
      );

      isTracking.value = true;

      if (debug) {
        console.log(
          "[useOverlayPositioning] Tracking started",
          autoUpdateConfig,
        );
      }

      return true;
    } catch (err) {
      console.error("[useOverlayPositioning] Failed to start tracking:", err);
      return false;
    }
  }

  /**
   * Stops automatic position tracking.
   * Cleans up auto-update subscription.
   *
   * @example
   * ```ts
   * stopTracking(); // Position will no longer update automatically
   * ```
   */
  function stopTracking(): void {
    if (cleanupAutoUpdate) {
      cleanupAutoUpdate();
      cleanupAutoUpdate = null;
      isTracking.value = false;

      if (debug) {
        console.log("[useOverlayPositioning] Tracking stopped");
      }
    }
  }

  /**
   * Restarts tracking with current configuration.
   * Useful after changing target/overlay elements.
   *
   * @returns True if restart successful
   */
  function restartTracking(): boolean {
    stopTracking();
    return startTracking();
  }

  /**
   * Resets overlay position to null.
   * Does not stop tracking.
   */
  function clearPosition(): void {
    overlayPosition.value = null;

    if (debug) {
      console.log("[useOverlayPositioning] Position cleared");
    }
  }

  /**
   * Clears any positioning errors.
   */
  function clearError(): void {
    error.value = null;
  }

  /**
   * Cleanup on component unmount.
   */
  onBeforeUnmount(() => {
    stopTracking();

    if (debug) {
      console.log("[useOverlayPositioning] Cleanup complete");
    }
  });

  return {
    // State (readonly to prevent external mutations)
    overlayPosition: readonly(overlayPosition),
    isTracking: readonly(isTracking),
    error: readonly(error),

    isReady,
    hasPosition,
    top,
    left,
    currentStrategy,
    config,

    updatePosition,
    clearPosition,

    startTracking,
    stopTracking,
    restartTracking,

    clearError,
  };
}
