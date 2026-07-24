/**
 * Tracks builder boot phases so the preloader can wait on data + UI hydration.
 */
import { ref, computed, readonly, type Ref, type ComputedRef } from "vue";
import { log } from "@/lib/utils/logger";
import { traceStartup } from "@/lib/startupTrace";

/**
 * Loading phase identifiers
 */
type LoadingPhase =
  | "initial"
  | "fetching-data"
  | "hydrating-ui"
  | "ready"
  | "error";

/**
 * Loading phase metadata
 */
interface LoadingPhaseInfo {
  readonly phase: LoadingPhase;
  readonly timestamp: number;
  duration?: number;
}

/**
 * Composable return type
 */
interface UseAppLoadingReturn {
  /** Whether builder data (pages/layouts/components) is loaded */
  readonly isBuilderDataLoaded: Ref<boolean>;
  /** Whether UI has hydrated and is interactive */
  readonly isUIReady: Ref<boolean>;
  /** Whether Studio has rendered */
  readonly isStudioReady: Ref<boolean>;
  /** Whether Stage/Canvas has rendered */
  readonly isStageReady: Ref<boolean>;
  /** Whether application is fully loaded and ready */
  readonly isFullyLoaded: ComputedRef<boolean>;
  /** Whether currently in loading state */
  readonly isLoading: ComputedRef<boolean>;
  /** Current loading phase */
  readonly currentPhase: Ref<LoadingPhase>;
  /** Loading phase history for debugging */
  readonly phaseHistory: ComputedRef<readonly LoadingPhaseInfo[]>;
  /** Error message if loading failed */
  readonly loadError: Ref<string | null>;
  /** Mark builder data as loaded */
  readonly setBuilderDataLoaded: (loaded: boolean) => void;
  /** Mark UI as ready */
  readonly setUIReady: (ready: boolean) => void;
  /** Mark Studio as ready */
  readonly setStudioReady: (ready: boolean) => void;
  /** Mark Stage/Canvas as ready */
  readonly setStageReady: (ready: boolean) => void;
  /** Set loading phase */
  readonly setPhase: (phase: LoadingPhase) => void;
  /** Set error state */
  readonly setError: (error: string) => void;
  /** Reset to initial state */
  readonly reset: () => void;
  /** Get total loading duration */
  readonly getTotalDuration: () => number;
}

interface WindowWithAriaPreloader extends Window {
  hideAriaPreloader?: () => void;
}

// MODULE STATE (SINGLETON)

/**
 * Whether builder data is loaded from server
 */
const isBuilderDataLoaded = ref<boolean>(false);

/**
 * Whether UI has fully hydrated
 */
const isUIReady = ref<boolean>(false);

/**
 * Whether Studio has rendered at least once
 */
const isStudioReady = ref<boolean>(false);

/**
 * Whether Stage/Canvas has rendered at least once
 */
const isStageReady = ref<boolean>(false);

/**
 * Current loading phase
 */
const currentPhase = ref<LoadingPhase>("initial");

/**
 * Loading error message if any
 */
const loadError = ref<string | null>(null);

/**
 * Loading phase history for performance tracking
 */
const phaseHistory = ref<LoadingPhaseInfo[]>([
  { phase: "initial", timestamp: Date.now() },
]);

/** SSR preloader dismissed once shell (Studio or Stage) is ready. */
let preloaderHidden = false;

function hideAriaPreloaderElement(): void {
  if (
    typeof window !== "undefined" &&
    typeof (window as WindowWithAriaPreloader).hideAriaPreloader === "function"
  ) {
    (window as WindowWithAriaPreloader).hideAriaPreloader?.();
  }
}

function hidePreloaderWhenShellReady(setPhaseFn: (phase: LoadingPhase) => void): void {
  if (preloaderHidden) return;
  if (!isStudioReady.value && !isStageReady.value) return;

  hideAriaPreloaderElement();
  preloaderHidden = true;

  if (currentPhase.value === "initial") {
    setPhaseFn("hydrating-ui");
  }

  traceStartup("app-loading:preloader-hidden", { reason: "shell-ready" });
}

/**
 * Record phase transition with timestamp
 */
function recordPhaseTransition(phase: LoadingPhase): void {
  const now = Date.now();
  const previous = phaseHistory.value[phaseHistory.value.length - 1];

  // Update previous phase duration
  if (previous && !previous.duration) {
    previous.duration = now - previous.timestamp;
  }

  // Add new phase
  phaseHistory.value.push({
    phase,
    timestamp: now,
  });
}

/**
 * Calculate total loading duration from initial to ready
 */
function calculateTotalDuration(): number {
  if (phaseHistory.value.length < 2) {
    return 0;
  }

  const first = phaseHistory.value[0];
  const last = phaseHistory.value[phaseHistory.value.length - 1];

  return last.timestamp - first.timestamp;
}

/**
 * App loading phases for the boot preloader
 *
 * @example
 * ```vue
 * <script setup>
 * const {
 *   isFullyLoaded,
 *   isLoading,
 *   setBuilderDataLoaded,
 *   setUIReady
 * } = useAppLoading();
 *
 * // In data fetching
 * const result = await actions.init();
 * setBuilderDataLoaded(true);
 *
 * // After UI hydration
 * onMounted(() => {
 *   setUIReady(true);
 * });
 * </script>
 *
 * <template>
 *   <div v-if="isLoading">Loading...</div>
 *   <div v-else>App content</div>
 * </template>
 * ```
 */
export function useAppLoading(): UseAppLoadingReturn {

  /**
   * Whether application is fully loaded and ready to use
   */
  const isFullyLoaded = computed<boolean>(
    () =>
      isBuilderDataLoaded.value &&
      isUIReady.value &&
      (isStudioReady.value || isStageReady.value) &&
      !loadError.value,
  );

  /**
   * Whether currently in a loading state
   */
  const isLoading = computed<boolean>(
    () => !isFullyLoaded.value && currentPhase.value !== "error",
  );

  /**
   * Readonly phase history for debugging
   */
  const phaseHistoryReadonly = computed<readonly LoadingPhaseInfo[]>(
    () => phaseHistory.value,
  );

  function finalizeBootCompleteIfPossible(): void {
    if (
      isBuilderDataLoaded.value &&
      isUIReady.value &&
      (isStudioReady.value || isStageReady.value) &&
      !loadError.value
    ) {
      traceStartup("app-loading:boot-complete", {
        builderDataLoaded: isBuilderDataLoaded.value,
        uiReady: isUIReady.value,
        studioReady: isStudioReady.value,
        stageReady: isStageReady.value,
      });
      setPhase("ready");
    }
  }

  /**
   * Mark builder data as loaded
   */
  function setBuilderDataLoaded(loaded: boolean): void {
    isBuilderDataLoaded.value = loaded;
    traceStartup("app-loading:set-builder-data-loaded", {
      loaded,
      phase: currentPhase.value,
    });

    if (loaded) {
      if (currentPhase.value === "fetching-data") {
        setPhase("hydrating-ui");
      } else if (currentPhase.value === "initial") {
        setPhase("fetching-data");
        // Auto-transition to next phase
        requestAnimationFrame(() => setPhase("hydrating-ui"));
      }
    }

    finalizeBootCompleteIfPossible();
  }

  /**
   * Mark UI as ready and interactive
   */
  function setUIReady(ready: boolean): void {
    isUIReady.value = ready;
    traceStartup("app-loading:set-ui-ready", {
      ready,
      builderDataLoaded: isBuilderDataLoaded.value,
    });

    finalizeBootCompleteIfPossible();
  }

  /**
   * Mark Studio as ready and interactive
   */
  function setStudioReady(ready: boolean): void {
    isStudioReady.value = ready;
    traceStartup("app-loading:set-studio-ready", {
      ready,
      builderDataLoaded: isBuilderDataLoaded.value,
      uiReady: isUIReady.value,
    });

    if (ready) {
      hidePreloaderWhenShellReady(setPhase);
    }
    finalizeBootCompleteIfPossible();
  }

  /**
   * Mark Stage/Canvas as ready (first paint complete)
   */
  function setStageReady(ready: boolean): void {
    isStageReady.value = ready;
    traceStartup("app-loading:set-stage-ready", {
      ready,
      builderDataLoaded: isBuilderDataLoaded.value,
      uiReady: isUIReady.value,
    });

    if (ready) {
      hidePreloaderWhenShellReady(setPhase);
    }
    finalizeBootCompleteIfPossible();
  }

  /**
   * Update current loading phase
   */
  function setPhase(phase: LoadingPhase): void {
    if (currentPhase.value === phase) {
      return; // Skip duplicate phase transitions
    }

    currentPhase.value = phase;
    recordPhaseTransition(phase);
    traceStartup("app-loading:phase", { phase });
  }

  /**
   * Set error state and transition to error phase
   */
  function setError(error: string): void {
    loadError.value = error;
    setPhase("error");
    traceStartup("app-loading:error", { error });

    log("error", "[useAppLoading] Load error", { error });
  }

  /**
   * Reset to initial loading state
   */
  function reset(): void {
    isBuilderDataLoaded.value = false;
    isUIReady.value = false;
    isStudioReady.value = false;
    isStageReady.value = false;
    currentPhase.value = "initial";
    loadError.value = null;
    phaseHistory.value = [{ phase: "initial", timestamp: Date.now() }];
    preloaderHidden = false;

    if (import.meta.env.DEV) {
      console.debug("[useAppLoading] State reset");
    }

    traceStartup("app-loading:reset");
  }

  /**
   * Get total loading duration in milliseconds
   */
  function getTotalDuration(): number {
    return calculateTotalDuration();
  }

  return {
    // State (readonly to prevent external mutation of refs)
    isBuilderDataLoaded: readonly(isBuilderDataLoaded) as Ref<boolean>,
    isUIReady: readonly(isUIReady) as Ref<boolean>,
    isStudioReady: readonly(isStudioReady) as Ref<boolean>,
    isStageReady: readonly(isStageReady) as Ref<boolean>,
    isFullyLoaded,
    isLoading,
    currentPhase: readonly(currentPhase) as Ref<LoadingPhase>,
    phaseHistory: phaseHistoryReadonly,
    loadError: readonly(loadError) as Ref<string | null>,

    // Actions
    setBuilderDataLoaded,
    setUIReady,
    setStudioReady,
    setStageReady,
    setPhase,
    setError,
    reset,
    getTotalDuration,
  };
}
