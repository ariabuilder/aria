/**
 * Convert between viewport (world) coords and iframe-local coords.
 */
import {
  ref,
  computed,
  readonly,
  type Ref,
  type ComputedRef,
  type DeepReadonly,
} from "vue";

/**
 * Rectangle with position and dimensions
 */
interface BoxRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 2D coordinates
 */
interface Coordinates {
  readonly x: number;
  readonly y: number;
}

/**
 * Viewport delta offset
 */
interface ViewportDelta {
  readonly x: number;
  readonly y: number;
}

/**
 * Canvas offset
 */
interface CanvasOffset {
  readonly left: number;
  readonly top: number;
}

/**
 * Transform matrix values
 */
interface TransformMatrix {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly translateX: number;
  readonly translateY: number;
}

/**
 * Coordinate bounds
 */
interface CoordinateBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Composable return type
 */
interface UseFrameCoordsReturn {
  /** Frame coordinates */
  readonly coords: DeepReadonly<Ref<Coordinates>>;
  /** Current zoom level */
  readonly zoom: DeepReadonly<Ref<number>>;
  /** Whether iframe is available */
  readonly hasIframe: ComputedRef<boolean>;
  /** Current frame dimensions */
  readonly frameDimensions: ComputedRef<{
    width: number;
    height: number;
  } | null>;
  /** Get frame box rectangle */
  readonly getFrameBoxRect: (
    canvasOffset: CanvasOffset,
    viewportDelta?: ViewportDelta,
  ) => BoxRect;
  /** Convert world to frame-local coordinates */
  readonly worldToFrameLocal: (worldX: number, worldY: number) => Coordinates;
  /** Get element at world coordinates */
  readonly getElementAtWorldPoint: (
    worldX: number,
    worldY: number,
  ) => Element | null;
  /** Get computed CSS scale */
  readonly getComputedScale: (element?: HTMLElement) => number;
  /** Set frame coordinates */
  readonly setCoords: (x: number, y: number) => void;
  /** Set zoom level */
  readonly setZoom: (zoom: number) => void;
  /** Check if point is within frame bounds */
  readonly isPointInFrame: (worldX: number, worldY: number) => boolean;
}

/** Default zoom level */
const DEFAULT_ZOOM = 1 as const;

/** Minimum zoom level */
const MIN_ZOOM = 0.1 as const;

/** Maximum zoom level */
const MAX_ZOOM = 10 as const;

/** Default viewport delta */
const DEFAULT_VIEWPORT_DELTA: ViewportDelta = { x: 0, y: 0 } as const;

/** Empty box rect */
const EMPTY_BOX_RECT: BoxRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
} as const;

/** Empty coordinates */
const EMPTY_COORDS: Coordinates = { x: 0, y: 0 } as const;

/**
 * Validate numeric coordinate
 */
function isValidCoordinate(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value) && isFinite(value);
}

/**
 * Validate zoom level
 */
function isValidZoom(zoom: number): boolean {
  return isValidCoordinate(zoom) && zoom >= MIN_ZOOM && zoom <= MAX_ZOOM;
}

/**
 * Validate HTML element
 */
function isValidElement(element: unknown): element is HTMLElement {
  return element instanceof HTMLElement;
}

/**
 * Validate DOMRect
 */
function isValidRect(rect: unknown): rect is DOMRect {
  return (
    rect instanceof DOMRect ||
    (typeof rect === "object" &&
      rect !== null &&
      "left" in rect &&
      "top" in rect &&
      "width" in rect &&
      "height" in rect)
  );
}

/**
 * Create coordinates object
 */
function createCoordinates(x: number, y: number): Coordinates {
  return { x, y };
}

/**
 * Clamp coordinate to bounds
 */
function clampCoordinate(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamp coordinates to bounds
 */
function clampToBounds(
  x: number,
  y: number,
  bounds: CoordinateBounds,
): Coordinates {
  return createCoordinates(
    clampCoordinate(x, bounds.minX, bounds.maxX),
    clampCoordinate(y, bounds.minY, bounds.maxY),
  );
}

/**
 * Create coordinate bounds from rect
 */
function createBoundsFromRect(rect: DOMRect, scale: number): CoordinateBounds {
  return {
    minX: 0,
    maxX: rect.width / scale,
    minY: 0,
    maxY: rect.height / scale,
  };
}

/**
 * Parse CSS transform matrix
 */
function parseTransformMatrix(transform: string): TransformMatrix | null {
  if (!transform || transform === "none") return null;

  // Match matrix(scaleX, skewY, skewX, scaleY, translateX, translateY)
  const matrixMatch = transform.match(
    /matrix\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/,
  );

  if (matrixMatch) {
    return {
      scaleX: parseFloat(matrixMatch[1]) || 1,
      scaleY: parseFloat(matrixMatch[4]) || 1,
      translateX: parseFloat(matrixMatch[5]) || 0,
      translateY: parseFloat(matrixMatch[6]) || 0,
    };
  }

  // Match scale(x, y) or scale(x)
  const scaleMatch = transform.match(/scale\(([^,)]+)(?:,\s*([^)]+))?\)/);
  if (scaleMatch) {
    const scaleX = parseFloat(scaleMatch[1]) || 1;
    const scaleY = scaleMatch[2] ? parseFloat(scaleMatch[2]) || 1 : scaleX;
    return { scaleX, scaleY, translateX: 0, translateY: 0 };
  }

  return null;
}

/**
 * Extract scale from transform matrix
 */
function extractScale(matrix: TransformMatrix | null): number {
  if (!matrix) return 1;
  // Use scaleX (assuming uniform scaling)
  return matrix.scaleX;
}

/**
 * Get effective CSS scale from element, including ancestor transforms.
 */
function getElementScale(element: HTMLElement): number {
  try {
    const style = window.getComputedStyle(element);
    const transform = style.transform;
    const matrix = parseTransformMatrix(transform);
    const ownScale = extractScale(matrix);

    const layoutWidth = element.offsetWidth;
    const visualRect = element.getBoundingClientRect();
    const visualWidth = visualRect.width;

    if (
      layoutWidth > 0 &&
      visualWidth > 0 &&
      Math.abs(layoutWidth - visualWidth) > 0.5
    ) {
      return visualWidth / layoutWidth;
    }

    return ownScale;
  } catch (error) {
    console.warn("[useFrameCoords] Failed to get element scale:", error);
    return 1;
  }
}

/**
 * Get iframe bounding rect safely
 */
function getIframeRect(iframe: HTMLIFrameElement | null): DOMRect | null {
  if (!iframe) return null;

  try {
    const rect = iframe.getBoundingClientRect();
    return isValidRect(rect) ? rect : null;
  } catch (error) {
    console.warn("[useFrameCoords] Failed to get iframe rect:", error);
    return null;
  }
}

/**
 * Get iframe content document safely
 */
function getIframeDocument(iframe: HTMLIFrameElement | null): Document | null {
  if (!iframe) return null;

  try {
    return iframe.contentDocument;
  } catch (error) {
    console.warn("[useFrameCoords] Failed to access iframe document:", error);
    return null;
  }
}

/**
 * Calculate frame box rect with transforms
 */
function calculateFrameBoxRect(
  frameRect: DOMRect,
  canvasOffset: CanvasOffset,
  viewportDelta: ViewportDelta,
  coords: Coordinates,
  zoomLevel: number,
): BoxRect {
  const x =
    (frameRect.x - canvasOffset.left - viewportDelta.x - coords.x) * zoomLevel;
  const y =
    (frameRect.y - canvasOffset.top - viewportDelta.y - coords.y) * zoomLevel;
  const width = frameRect.width * zoomLevel;
  const height = frameRect.height * zoomLevel;

  return { x, y, width, height };
}

/**
 * Convert world coordinates to frame-local with scale
 */
function worldToLocal(
  worldX: number,
  worldY: number,
  frameRect: DOMRect,
  scale: number,
): Coordinates {
  const localX = (worldX - frameRect.left) / scale;
  const localY = (worldY - frameRect.top) / scale;

  return createCoordinates(localX, localY);
}

/**
 * Coordinate transforms for the iframe canvas
 *
 * Calculates frame-local coordinates without postMessage or RAF polling. Works identically on
 * local and Cloudflare Edge.
 *
 * @param iframeElement - Reference to iframe element
 *
 * @example
 * ```vue
 * <script setup>
 * const iframeRef = ref<HTMLIFrameElement | null>(null);
 * const {
 *   coords,
 *   zoom,
 *   hasIframe,
 *   getFrameBoxRect,
 *   worldToFrameLocal,
 *   getElementAtWorldPoint,
 *   setCoords,
 *   setZoom,
 *   isPointInFrame
 * } = useFrameCoords(iframeRef);
 *
 * // Get frame box rect with canvas offset
 * const canvasOffset = { left: 100, top: 50 };
 * const boxRect = getFrameBoxRect(canvasOffset);
 *
 * // Convert mouse coordinates to frame-local
 * function handleMouseMove(event: MouseEvent) {
 *   const local = worldToFrameLocal(event.clientX, event.clientY);
 *   console.log('Frame-local coords:', local);
 * }
 *
 * // Pick element at mouse position
 * function handleClick(event: MouseEvent) {
 *   const element = getElementAtWorldPoint(event.clientX, event.clientY);
 *   if (element) {
 *     const nodeId = element.getAttribute('data-aria-id');
 *   }
 * }
 *
 * // Check if point is in frame
 * function handleDrag(x: number, y: number) {
 *   if (isPointInFrame(x, y)) {
 *     // Handle in-frame drag
 *   }
 * }
 * </script>
 * ```
 */
export function useFrameCoords(
  iframeElement: Ref<HTMLIFrameElement | null>,
): UseFrameCoordsReturn {

  const coords = ref<Coordinates>(createCoordinates(0, 0));
  const zoom = ref<number>(DEFAULT_ZOOM);

  /**
   * Whether iframe is available
   */
  const hasIframe = computed<boolean>(() => iframeElement.value !== null);

  /**
   * Current frame dimensions
   */
  const frameDimensions = computed<{
    width: number;
    height: number;
  } | null>(() => {
    const rect = getIframeRect(iframeElement.value);
    if (!rect) return null;

    return {
      width: rect.width,
      height: rect.height,
    };
  });

  /**
   * Calculate frame box rect in viewport coordinates
   *
   * Accounts for: frame position, canvas offset, viewport delta,
   * coordinates, and zoom level.
   */
  function getFrameBoxRect(
    canvasOffset: CanvasOffset,
    viewportDelta: ViewportDelta = DEFAULT_VIEWPORT_DELTA,
  ): BoxRect {
    const rect = getIframeRect(iframeElement.value);

    if (!rect) {
      if (import.meta.env.DEV) {
        console.debug("[useFrameCoords] No iframe rect available");
      }
      return EMPTY_BOX_RECT;
    }

    const zoomLevel = zoom.value || DEFAULT_ZOOM;

    return calculateFrameBoxRect(
      rect,
      canvasOffset,
      viewportDelta,
      coords.value,
      zoomLevel,
    );
  }

  /**
   * Convert world coordinates to frame-local coordinates
   *
   * World coordinates = viewport coordinates (from mouse events)
   * Frame-local = coordinates relative to iframe's top-left
   *
   * Clamps to iframe bounds so elementFromPoint works when dragging
   * from outside the iframe.
   */
  function worldToFrameLocal(worldX: number, worldY: number): Coordinates {
    if (!isValidCoordinate(worldX) || !isValidCoordinate(worldY)) {
      console.warn("[useFrameCoords] Invalid world coordinates:", {
        worldX,
        worldY,
      });
      return EMPTY_COORDS;
    }

    const iframe = iframeElement.value;
    if (!iframe) {
      if (import.meta.env.DEV) {
        console.debug("[useFrameCoords] No iframe element");
      }
      return EMPTY_COORDS;
    }

    const frameRect = getIframeRect(iframe);
    if (!frameRect) {
      return EMPTY_COORDS;
    }

    const scale = getElementScale(iframe);

    // Convert to frame-local coordinates
    const local = worldToLocal(worldX, worldY, frameRect, scale);

    // Clamp to iframe bounds
    const bounds = createBoundsFromRect(frameRect, scale);
    const clamped = clampToBounds(local.x, local.y, bounds);

    if (import.meta.env.DEV) {
      console.debug(
        `[useFrameCoords] World (${worldX}, ${worldY}) → Local (${local.x.toFixed(2)}, ${local.y.toFixed(2)}) → Clamped (${clamped.x.toFixed(2)}, ${clamped.y.toFixed(2)})`,
      );
    }

    return clamped;
  }

  /**
   * Get element at world coordinates
   *
   * Converts world coordinates to frame-local and uses elementFromPoint.
   * Safe - works even at iframe boundaries.
   *
   * @returns DOM element at position, or null if not found
   */
  function getElementAtWorldPoint(
    worldX: number,
    worldY: number,
  ): Element | null {
    const local = worldToFrameLocal(worldX, worldY);
    const frameDoc = getIframeDocument(iframeElement.value);

    if (!frameDoc) {
      if (import.meta.env.DEV) {
        console.debug("[useFrameCoords] No iframe document");
      }
      return null;
    }

    try {
      const element = frameDoc.elementFromPoint(local.x, local.y);

      if (import.meta.env.DEV) {
        console.debug(
          `[useFrameCoords] Element at world (${worldX}, ${worldY}) → local (${local.x.toFixed(2)}, ${local.y.toFixed(2)}):`,
          element?.tagName,
          element?.getAttribute("data-aria-id"),
        );
      }

      return element;
    } catch (error) {
      console.warn("[useFrameCoords] elementFromPoint failed:", error);
      return null;
    }
  }

  /**
   * Get computed CSS scale from element
   *
   * Used to account for any zoom/scale transforms on the iframe.
   * If no element provided, uses the iframe element.
   */
  function getComputedScale(element?: HTMLElement): number {
    const targetElement = element || iframeElement.value;

    if (!isValidElement(targetElement)) {
      return DEFAULT_ZOOM;
    }

    return getElementScale(targetElement);
  }

  /**
   * Check if world point is within frame bounds
   */
  function isPointInFrame(worldX: number, worldY: number): boolean {
    const rect = getIframeRect(iframeElement.value);
    if (!rect) return false;

    return (
      worldX >= rect.left &&
      worldX <= rect.right &&
      worldY >= rect.top &&
      worldY <= rect.bottom
    );
  }

  /**
   * Set frame coordinates
   */
  function setCoords(x: number, y: number): void {
    if (!isValidCoordinate(x) || !isValidCoordinate(y)) {
      console.warn("[useFrameCoords] Invalid coordinates:", { x, y });
      return;
    }

    coords.value = createCoordinates(x, y);

    if (import.meta.env.DEV) {
      console.debug(`[useFrameCoords] Coords set: (${x}, ${y})`);
    }
  }

  /**
   * Set zoom level
   */
  function setZoom(zoomLevel: number): void {
    if (!isValidZoom(zoomLevel)) {
      console.warn("[useFrameCoords] Invalid zoom level:", zoomLevel);
      return;
    }

    zoom.value = zoomLevel;

    if (import.meta.env.DEV) {
      console.debug(`[useFrameCoords] Zoom set: ${zoomLevel}`);
    }
  }

  return {
    // State (readonly to prevent external mutation)
    coords: readonly(coords) as DeepReadonly<Ref<Coordinates>>,
    zoom: readonly(zoom) as DeepReadonly<Ref<number>>,

    // Computed state
    hasIframe,
    frameDimensions,

    // Transformations
    getFrameBoxRect,
    worldToFrameLocal,
    getElementAtWorldPoint,
    getComputedScale,

    // Utilities
    setCoords,
    setZoom,
    isPointInFrame,
  };
}

export type {
  BoxRect,
  Coordinates,
  ViewportDelta,
  CanvasOffset,
  TransformMatrix,
  CoordinateBounds,
};
