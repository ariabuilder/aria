/**
 * Composer zoom/pan state and selection/hover/target spot markers.
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
 * Spot type for visual indicators
 */
type SpotType = "select" | "hover" | "target";

/**
 * Composer spot (visual indicator)
 */
interface ComposerSpot {
  /** Unique identifier */
  readonly id: string;
  /** Spot type */
  readonly type: SpotType;
  /** X position in pixels */
  readonly x: number;
  /** Y position in pixels */
  readonly y: number;
  /** Width in pixels */
  readonly width: number;
  /** Height in pixels */
  readonly height: number;
}

/**
 * Coordinates for canvas position
 */
interface Coordinates {
  readonly x: number;
  readonly y: number;
}

/**
 * Spot creation options
 */
interface CreateSpotOptions {
  readonly id?: string;
  readonly type?: SpotType;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Composable return type
 */
interface UseComposerReturn {
  /** Current zoom percentage */
  readonly zoom: DeepReadonly<Ref<number>>;
  /** Canvas pan coordinates */
  readonly coords: DeepReadonly<Ref<Coordinates>>;
  /** Active visual spots */
  readonly spots: DeepReadonly<Ref<ComposerSpot[]>>;
  /** Zoom as decimal (1.0 = 100%) */
  readonly zoomDecimal: ComputedRef<number>;
  /** Zoom multiplier for inverse scaling */
  readonly zoomMultiplier: ComputedRef<number>;
  /** Current spot count */
  readonly spotCount: ComputedRef<number>;
  readonly isMinZoom: ComputedRef<boolean>;
  /** Whether at maximum zoom */
  readonly isMaxZoom: ComputedRef<boolean>;
  /** Whether canvas is panned */
  readonly isPanned: ComputedRef<boolean>;
  /** Set zoom level */
  readonly setZoom: (value: number) => void;
  /** Increase zoom by step */
  readonly zoomIn: (step?: number) => void;
  /** Decrease zoom by step */
  readonly zoomOut: (step?: number) => void;
  /** Reset zoom to 100% */
  readonly resetZoom: () => void;
  /** Set canvas coordinates */
  readonly setCoords: (x: number, y: number) => void;
  /** Reset coordinates to origin */
  readonly resetCoords: () => void;
  /** Reset zoom and coordinates */
  readonly resetView: () => void;
  /** Add visual spot */
  readonly addSpot: (options: CreateSpotOptions) => ComposerSpot;
  /** Update existing spot */
  readonly updateSpot: (id: string, updates: Partial<ComposerSpot>) => boolean;
  /** Remove spot(s) */
  readonly removeSpots: (id?: string) => void;
  /** Remove spots by type */
  readonly removeSpotsByType: (type: SpotType) => void;
  /** Clear all spots */
  readonly clearAllSpots: () => void;
  /** Find spot by ID */
  readonly findSpot: (id: string) => ComposerSpot | undefined;
}

/** Minimum zoom percentage */
const MIN_ZOOM = 10 as const;

/** Maximum zoom percentage */
const MAX_ZOOM = 200 as const;

/** Default zoom percentage */
const DEFAULT_ZOOM = 100 as const;

/** Default zoom step */
const DEFAULT_ZOOM_STEP = 10 as const;

/** Default spot type */
const DEFAULT_SPOT_TYPE: SpotType = "select" as const;

/** Spot types */
const SPOT_TYPES = {
  SELECT: "select" as const,
  HOVER: "hover" as const,
  TARGET: "target" as const,
};

/**
 * Clamp zoom value to valid range
 */
function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

/**
 * Calculate zoom decimal from percentage
 */
function calculateZoomDecimal(zoomPercent: number): number {
  return zoomPercent / 100;
}

/**
 * Calculate zoom multiplier (inverse)
 */
function calculateZoomMultiplier(zoomPercent: number): number {
  return 100 / zoomPercent;
}

/**
 * Create coordinates object
 */
function createCoordinates(x: number, y: number): Coordinates {
  return { x, y };
}

/**
 * Validate coordinate value
 */
function isValidCoordinate(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value) && isFinite(value);
}

/**
 * Check if coordinates are at origin
 */
function isAtOrigin(coords: Coordinates): boolean {
  return coords.x === 0 && coords.y === 0;
}

/**
 * Generate unique spot ID
 */
function generateSpotId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `spot-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Validate spot type
 */
function isValidSpotType(type: unknown): type is SpotType {
  return (
    type === SPOT_TYPES.SELECT ||
    type === SPOT_TYPES.HOVER ||
    type === SPOT_TYPES.TARGET
  );
}

/**
 * Create spot with defaults
 */
function createSpot(options: CreateSpotOptions): ComposerSpot {
  return {
    id: options.id ?? generateSpotId(),
    type: options.type ?? DEFAULT_SPOT_TYPE,
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 0,
    height: options.height ?? 0,
  };
}

/**
 * Validate spot structure
 */
function isValidSpot(spot: unknown): spot is ComposerSpot {
  if (!spot || typeof spot !== "object") return false;

  const s = spot as Partial<ComposerSpot>;
  return (
    typeof s.id === "string" &&
    isValidSpotType(s.type) &&
    typeof s.x === "number" &&
    typeof s.y === "number" &&
    typeof s.width === "number" &&
    typeof s.height === "number"
  );
}

/**
 * Composer zoom/pan state and spot markers
 *
 * @example
 * ```vue
 * <script setup>
 * const {
 *   zoom,
 *   coords,
 *   spots,
 *   zoomDecimal,
 *   isMinZoom,
 *   isMaxZoom,
 *   setZoom,
 *   zoomIn,
 *   zoomOut,
 *   setCoords,
 *   resetView,
 *   addSpot,
 *   removeSpots
 * } = useComposer();
 *
 * // Zoom controls
 * function handleZoomIn() {
 *   zoomIn(10); // Increase by 10%
 * }
 *
 * function handleZoomOut() {
 *   if (!isMinZoom.value) {
 *     zoomOut(10);
 *   }
 * }
 *
 * // Pan canvas
 * function handlePan(deltaX: number, deltaY: number) {
 *   setCoords(coords.value.x + deltaX, coords.value.y + deltaY);
 * }
 *
 * // Add selection spot
 * function handleSelection(x: number, y: number, width: number, height: number) {
 *   addSpot({ type: 'select', x, y, width, height });
 * }
 *
 * // Clear all spots
 * function handleDeselect() {
 *   removeSpots();
 * }
 *
 * // Apply zoom transform
 * const transform = computed(() => ({
 *   transform: `scale(${zoomDecimal.value}) translate(${coords.value.x}px, ${coords.value.y}px)`
 * }));
 * </script>
 * ```
 */
export function useComposer(): UseComposerReturn {

  const zoom = ref<number>(DEFAULT_ZOOM);
  const coords = ref<Coordinates>(createCoordinates(0, 0));
  const spots = ref<ComposerSpot[]>([]);

  /**
   * Zoom as decimal (1.0 = 100%)
   */
  const zoomDecimal = computed<number>(() => calculateZoomDecimal(zoom.value));

  /**
   * Zoom multiplier for inverse scaling
   */
  const zoomMultiplier = computed<number>(() =>
    calculateZoomMultiplier(zoom.value),
  );

  /**
   * Current number of spots
   */
  const spotCount = computed<number>(() => spots.value.length);

  /**
   * Whether zoom is at minimum
   */
  const isMinZoom = computed<boolean>(() => zoom.value <= MIN_ZOOM);

  /**
   * Whether zoom is at maximum
   */
  const isMaxZoom = computed<boolean>(() => zoom.value >= MAX_ZOOM);

  /**
   * Whether canvas is panned away from origin
   */
  const isPanned = computed<boolean>(() => !isAtOrigin(coords.value));

  /**
   * Set zoom level with validation
   */
  function setZoom(value: number): void {
    if (!isValidCoordinate(value)) {
      console.warn("[useComposer] Invalid zoom value:", value);
      return;
    }

    const oldZoom = zoom.value;
    zoom.value = clampZoom(value);

    if (import.meta.env.DEV && oldZoom !== zoom.value) {
      console.debug(`[useComposer] Zoom changed: ${oldZoom}% → ${zoom.value}%`);
    }
  }

  /**
   * Increase zoom by step
   */
  function zoomIn(step: number = DEFAULT_ZOOM_STEP): void {
    setZoom(zoom.value + step);
  }

  /**
   * Decrease zoom by step
   */
  function zoomOut(step: number = DEFAULT_ZOOM_STEP): void {
    setZoom(zoom.value - step);
  }

  /**
   * Reset zoom to default (100%)
   */
  function resetZoom(): void {
    setZoom(DEFAULT_ZOOM);
  }

  /**
   * Set canvas pan coordinates
   */
  function setCoords(x: number, y: number): void {
    if (!isValidCoordinate(x) || !isValidCoordinate(y)) {
      console.warn("[useComposer] Invalid coordinates:", { x, y });
      return;
    }

    coords.value = createCoordinates(x, y);
  }

  /**
   * Reset coordinates to origin
   */
  function resetCoords(): void {
    setCoords(0, 0);
  }

  /**
   * Reset both zoom and coordinates
   */
  function resetView(): void {
    resetZoom();
    resetCoords();

    if (import.meta.env.DEV) {
      console.debug("[useComposer] View reset to defaults");
    }
  }

  /**
   * Add visual spot to canvas
   */
  function addSpot(options: CreateSpotOptions): ComposerSpot {
    const spot = createSpot(options);

    if (!isValidSpot(spot)) {
      console.error("[useComposer] Invalid spot structure:", spot);
      throw new Error("Invalid spot structure");
    }

    spots.value = [...spots.value, spot];

    if (import.meta.env.DEV) {
      console.debug(`[useComposer] Spot added: ${spot.id} (${spot.type})`);
    }

    return spot;
  }

  /**
   * Update existing spot
   */
  function updateSpot(id: string, updates: Partial<ComposerSpot>): boolean {
    const index = spots.value.findIndex((s) => s.id === id);

    if (index === -1) {
      console.warn("[useComposer] Spot not found:", id);
      return false;
    }

    const updatedSpot = { ...spots.value[index], ...updates };

    if (!isValidSpot(updatedSpot)) {
      console.error("[useComposer] Invalid spot update:", updates);
      return false;
    }

    spots.value = [
      ...spots.value.slice(0, index),
      updatedSpot,
      ...spots.value.slice(index + 1),
    ];

    if (import.meta.env.DEV) {
      console.debug(`[useComposer] Spot updated: ${id}`);
    }

    return true;
  }

  /**
   * Remove spot(s) by ID
   */
  function removeSpots(id?: string): void {
    if (id) {
      const count = spots.value.length;
      spots.value = spots.value.filter((s) => s.id !== id);

      if (import.meta.env.DEV && spots.value.length < count) {
        console.debug(`[useComposer] Spot removed: ${id}`);
      }
    } else {
      clearAllSpots();
    }
  }

  /**
   * Remove spots by type
   */
  function removeSpotsByType(type: SpotType): void {
    if (!isValidSpotType(type)) {
      console.warn("[useComposer] Invalid spot type:", type);
      return;
    }

    const count = spots.value.length;
    spots.value = spots.value.filter((s) => s.type !== type);

    if (import.meta.env.DEV && spots.value.length < count) {
      console.debug(
        `[useComposer] Removed ${count - spots.value.length} spots of type: ${type}`,
      );
    }
  }

  /**
   * Clear all spots
   */
  function clearAllSpots(): void {
    const count = spots.value.length;
    spots.value = [];

    if (import.meta.env.DEV && count > 0) {
      console.debug(`[useComposer] All spots cleared (${count} removed)`);
    }
  }

  /**
   * Find spot by ID
   */
  function findSpot(id: string): ComposerSpot | undefined {
    return spots.value.find((s) => s.id === id);
  }

  return {
    // State (readonly to prevent external mutation)
    zoom: readonly(zoom) as DeepReadonly<Ref<number>>,
    coords: readonly(coords) as DeepReadonly<Ref<Coordinates>>,
    spots: readonly(spots) as DeepReadonly<Ref<ComposerSpot[]>>,

    // Computed state
    zoomDecimal,
    zoomMultiplier,
    spotCount,
    isMinZoom,
    isMaxZoom,
    isPanned,

    // Zoom operations
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,

    // Coordinate operations
    setCoords,
    resetCoords,
    resetView,

    // Spot operations
    addSpot,
    updateSpot,
    removeSpots,
    removeSpotsByType,
    clearAllSpots,
    findSpot,
  };
}

export type { ComposerSpot, Coordinates, CreateSpotOptions, SpotType };
