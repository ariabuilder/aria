/**
 * Single highlight overlay for an element inside the canvas iframe.
 */
import {
  ref,
  computed,
  readonly,
  onUnmounted,
  type Ref,
  type ComputedRef,
  type DeepReadonly,
} from "vue";

/**
 * Border style options
 */
type BorderStyle = "solid" | "dashed" | "dotted" | "double";

/**
 * Overlay configuration options
 */
interface OverlayConfig {
  /** Border color (CSS color value) */
  readonly color?: string;
  /** Border style */
  readonly borderStyle?: BorderStyle;
  /** Border width in pixels */
  readonly borderWidth?: number;
  /** Background opacity (0-1) */
  readonly opacity?: number;
  /** Enable box shadow */
  readonly shadow?: boolean;
  /** Transition duration in milliseconds */
  readonly transitionDuration?: number;
}

/**
 * Position and dimensions
 */
interface Position {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Offset coordinates
 */
interface Offset {
  readonly left: number;
  readonly top: number;
}

/**
 * Overlay state information
 */
interface OverlayState {
  /** Whether overlay is currently visible */
  readonly visible: boolean;
  /** Current configuration */
  readonly config: OverlayConfig | null;
  /** Current target element */
  readonly targetElement: Element | null;
  /** Last calculated position */
  readonly position: Position | null;
}

/**
 * Composable return type
 */
interface UseCanvasOverlayReturn {
  /** Whether overlay is currently visible */
  readonly isVisible: DeepReadonly<Ref<boolean>>;
  /** Current overlay configuration */
  readonly config: DeepReadonly<Ref<OverlayConfig | null>>;
  /** Current overlay state */
  readonly state: ComputedRef<OverlayState>;
  /** Whether overlay element exists in DOM */
  readonly hasOverlayElement: ComputedRef<boolean>;
  /** Show overlay over element */
  readonly show: (element: Element, config?: OverlayConfig) => void;
  /** Hide overlay */
  readonly hide: () => void;
  /** Update overlay position */
  readonly updatePosition: (element?: Element) => void;
  /** Toggle overlay visibility */
  readonly toggle: (element?: Element, config?: OverlayConfig) => void;
  /** Reset overlay to default configuration */
  readonly reset: () => void;
  /** Remove overlay from DOM */
  readonly cleanup: () => void;
}

/** Default overlay opacity */
const DEFAULT_OPACITY = 0.02 as const;

/** Default border width in pixels */
const DEFAULT_BORDER_WIDTH = 1 as const;

/** Default border style */
const DEFAULT_BORDER_STYLE: BorderStyle = "dashed" as const;

/** Overlay z-index (high value to ensure visibility) */
const OVERLAY_Z_INDEX = 10 as const;

/** Default transition duration in milliseconds */
const DEFAULT_TRANSITION_DURATION = 50 as const;

/** Overlay element class name */
const OVERLAY_CLASS_NAME = "canvas-hover-overlay" as const;

/** Overlay data attribute */
const OVERLAY_DATA_ATTR = "data-overlay" as const;

/** CSS custom property names */
const CSS_VARIABLES = {
  PRIMARY_COLOR: "--primary",
  OVERLAY_COLOR: "--primary",
  OVERLAY_OPACITY: "0.2",
} as const;

/**
 * Convert opacity to hex alpha value
 */
function opacityToHex(opacity: number): string {
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  const alpha = Math.round(clampedOpacity * 255);
  return alpha.toString(16).padStart(2, "0");
}

/**
 * Generate CSS for overlay element
 */
function generateOverlayCSS(config?: OverlayConfig): string {
  const opacity = config?.opacity ?? DEFAULT_OPACITY;
  const transitionDuration =
    config?.transitionDuration ?? DEFAULT_TRANSITION_DURATION;
  const borderWidth = config?.borderWidth ?? DEFAULT_BORDER_WIDTH;
  const borderStyle = config?.borderStyle ?? DEFAULT_BORDER_STYLE;
  const shadow = config?.shadow ?? true;

  const styles: string[] = [
    "position: fixed",
    "pointer-events: none",
    `z-index: ${OVERLAY_Z_INDEX}`,
    `border: ${borderWidth}px ${borderStyle} var(${CSS_VARIABLES.PRIMARY_COLOR})`,
    `background: color-mix(in srgb, var(${CSS_VARIABLES.PRIMARY_COLOR}) ${opacity * 100}%, transparent)`,
    `transition: all ${transitionDuration}ms ease-out`,
    "display: none",
  ];

  if (shadow) {
    styles.push(
      `box-shadow: inset 0 0 4px color-mix(in srgb, var(${CSS_VARIABLES.PRIMARY_COLOR}) 20%, transparent)`,
    );
  }

  return styles.join(";\n      ");
}

/**
 * Create overlay DOM element
 */
function createOverlayElement(config?: OverlayConfig): HTMLElement {
  const element = document.createElement("div");

  element.className = OVERLAY_CLASS_NAME;
  element.setAttribute(OVERLAY_DATA_ATTR, "hover");
  element.style.cssText = generateOverlayCSS(config);

  // Append to document body
  document.body.appendChild(element);

  if (import.meta.env.DEV) {
    console.debug("[useCanvasOverlay] Overlay element created");
  }

  return element;
}

/**
 * Get iframe offset relative to viewport
 */
function calculateIframeOffset(
  iframe: HTMLIFrameElement | null | undefined,
): Offset {
  if (!iframe) {
    return { left: 0, top: 0 };
  }

  const rect = iframe.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
  };
}

/**
 * Calculate element position with iframe offset
 */
function calculateElementPosition(
  element: Element,
  iframeOffset: Offset,
): Position {
  const rect = element.getBoundingClientRect();

  return {
    left: rect.left + iframeOffset.left,
    top: rect.top + iframeOffset.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Validate element for positioning
 * Note: Cannot use instanceof Element because iframe elements are from a different window context
 */
function isValidElement(element: unknown): element is Element {
  if (element == null || typeof element !== "object") {
    return false;
  }

  const candidate = element as Record<string, unknown>;

  return (
    "getBoundingClientRect" in candidate &&
    typeof candidate.getBoundingClientRect === "function" &&
    "nodeType" in candidate &&
    candidate.nodeType === 1 // ELEMENT_NODE
  );
}

/**
 * Apply position styles to overlay element
 */
function applyPositionStyles(element: HTMLElement, position: Position): void {
  const { left, top, width, height } = position;

  Object.assign(element.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
}

/**
 * Apply configuration styles to overlay element
 */
function applyConfigStyles(element: HTMLElement, config: OverlayConfig): void {
  const {
    color,
    borderStyle,
    borderWidth,
    opacity = DEFAULT_OPACITY,
    shadow = true,
    transitionDuration = DEFAULT_TRANSITION_DURATION,
  } = config;

  if (color) {
    const alphaHex = opacityToHex(opacity);
    element.style.borderColor = color;
    element.style.background = `${color}${alphaHex}`;
  }

  if (borderStyle) {
    element.style.borderStyle = borderStyle;
  }

  if (borderWidth !== undefined) {
    element.style.borderWidth = `${borderWidth}px`;
  }

  if (transitionDuration !== undefined) {
    element.style.transition = `all ${transitionDuration}ms ease-out`;
  }

  if (shadow) {
    element.style.boxShadow = `inset 0 0 4px color-mix(in srgb, var(${CSS_VARIABLES.PRIMARY_COLOR}) 20%, transparent)`;
  } else {
    element.style.boxShadow = "none";
  }
}

/**
 * Show overlay element
 */
function showOverlayElement(element: HTMLElement): void {
  element.style.display = "block";
}

/**
 * Hide overlay element
 */
function hideOverlayElement(element: HTMLElement): void {
  element.style.display = "none";
}

/**
 * Create default overlay configuration
 */
function createDefaultConfig(): OverlayConfig {
  return {
    opacity: DEFAULT_OPACITY,
    borderWidth: DEFAULT_BORDER_WIDTH,
    borderStyle: DEFAULT_BORDER_STYLE,
    shadow: true,
    transitionDuration: DEFAULT_TRANSITION_DURATION,
  };
}

/**
 * Merge configuration with defaults
 */
function mergeConfig(config?: OverlayConfig): OverlayConfig {
  if (!config) return createDefaultConfig();

  return {
    ...createDefaultConfig(),
    ...config,
  };
}

/**
 * Highlight overlay for canvas elements
 *
 * @param iframeRef - Reference to canvas iframe element
 *
 * @example
 * ```vue
 * <script setup>
 * const iframeRef = ref<HTMLIFrameElement | null>(null);
 * const overlay = useCanvasOverlay(iframeRef);
 *
 * // Show overlay on hover
 * function handleMouseOver(element: Element) {
 *   overlay.show(element, {
 *     color: '#3b82f6',
 *     borderStyle: 'dashed',
 *     opacity: 0.1
 *   });
 * }
 *
 * // Hide on mouse out
 * function handleMouseOut() {
 *   overlay.hide();
 * }
 *
 * // Update position on scroll
 * function handleScroll(element: Element) {
 *   if (overlay.isVisible.value) {
 *     overlay.updatePosition(element);
 *   }
 * }
 *
 * // Toggle with custom config
 * function handleToggle(element: Element) {
 *   overlay.toggle(element, { borderWidth: 2 });
 * }
 * </script>
 * ```
 */
export function useCanvasOverlay(
  iframeRef?: Ref<HTMLIFrameElement | null>,
): UseCanvasOverlayReturn {

  const overlayElement = ref<HTMLElement | null>(null);
  const isVisible = ref<boolean>(false);
  const currentConfig = ref<OverlayConfig | null>(null);
  const targetElement = ref<Element | null>(null);
  const lastPosition = ref<Position | null>(null);

  /**
   * Whether overlay element exists in DOM
   */
  const hasOverlayElement = computed<boolean>(
    () => overlayElement.value !== null,
  );

  /**
   * Complete overlay state
   */
  const state = computed<OverlayState>(() => ({
    visible: isVisible.value,
    config: currentConfig.value,
    targetElement: targetElement.value,
    position: lastPosition.value,
  }));

  /**
   * Ensure overlay element exists
   */
  function ensureOverlayElement(config?: OverlayConfig): HTMLElement {
    if (!overlayElement.value) {
      overlayElement.value = createOverlayElement(config);
    }
    return overlayElement.value;
  }

  /**
   * Calculate and cache position
   */
  function calculateAndCachePosition(element: Element): Position | null {
    if (!isValidElement(element)) {
      console.warn("[useCanvasOverlay] Invalid element provided");
      return null;
    }

    const offset = calculateIframeOffset(iframeRef?.value);
    const position = calculateElementPosition(element, offset);

    lastPosition.value = position;
    return position;
  }

  /**
   * Show overlay over specified element
   *
   * Creates overlay element if needed and applies configuration.
   */
  function show(element: Element, config?: OverlayConfig): void {
    if (!isValidElement(element)) {
      console.warn("[useCanvasOverlay] Cannot show: invalid element");
      return;
    }

    // Ensure overlay element exists
    const overlay = ensureOverlayElement(config);

    // Calculate position
    const position = calculateAndCachePosition(element);
    if (!position) return;

    // Apply position
    applyPositionStyles(overlay, position);

    // Apply custom configuration if provided
    const mergedConfig = mergeConfig(config);
    if (config) {
      currentConfig.value = mergedConfig;
      applyConfigStyles(overlay, mergedConfig);
    }

    // Show overlay
    showOverlayElement(overlay);

    // Update state
    isVisible.value = true;
    targetElement.value = element;

    if (import.meta.env.DEV) {
      console.debug("[useCanvasOverlay] Shown at:", position);
    }
  }

  /**
   * Hide overlay
   */
  function hide(): void {
    if (!overlayElement.value) return;

    hideOverlayElement(overlayElement.value);

    isVisible.value = false;
    targetElement.value = null;
    currentConfig.value = null;

    if (import.meta.env.DEV) {
      console.debug("[useCanvasOverlay] Hidden");
    }
  }

  /**
   * Update overlay position
   *
   * Useful for scroll events or when element position changes.
   * If no element provided, uses last target element.
   */
  function updatePosition(element?: Element): void {
    const target = element || targetElement.value;

    if (!overlayElement.value || !isVisible.value || !target) {
      return;
    }

    const position = calculateAndCachePosition(target);
    if (!position) return;

    applyPositionStyles(overlayElement.value, position);
  }

  /**
   * Toggle overlay visibility
   */
  function toggle(element?: Element, config?: OverlayConfig): void {
    if (isVisible.value) {
      hide();
    } else if (element) {
      show(element, config);
    }
  }

  /**
   * Reset overlay to default configuration
   */
  function reset(): void {
    if (!overlayElement.value) return;

    const defaultConfig = createDefaultConfig();
    currentConfig.value = defaultConfig;
    applyConfigStyles(overlayElement.value, defaultConfig);

    if (import.meta.env.DEV) {
      console.debug("[useCanvasOverlay] Reset to defaults");
    }
  }

  /**
   * Remove overlay from DOM and cleanup state
   */
  function cleanup(): void {
    if (overlayElement.value) {
      overlayElement.value.remove();
      overlayElement.value = null;

      if (import.meta.env.DEV) {
        console.debug("[useCanvasOverlay] Cleanup complete");
      }
    }

    isVisible.value = false;
    currentConfig.value = null;
    targetElement.value = null;
    lastPosition.value = null;
  }

  /**
   * Auto-cleanup on component unmount
   */
  onUnmounted(() => {
    cleanup();
  });

  return {
    // State (readonly to prevent external mutation)
    isVisible: readonly(isVisible) as DeepReadonly<Ref<boolean>>,
    config: readonly(currentConfig) as DeepReadonly<Ref<OverlayConfig | null>>,
    state,
    hasOverlayElement,

    // Operations
    show,
    hide,
    updatePosition,
    toggle,
    reset,
    cleanup,
  };
}
