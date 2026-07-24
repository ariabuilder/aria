/**
 * Watches app shell signals and drives Studio ↔ Composer transition overlay.
 */

import { nextTick, onScopeDispose, watch, type ComputedRef, type Ref } from "vue";
import { useAppLoading } from "../../Composer/composables/useAppLoading";
import type { UseAppRouterReturn } from "./useAppRouter";
import type { LoadingState } from "./useEditorContext";
import {
  STAGE_IDLE_KEY,
  editorContentMatchesTarget,
} from "../schemas/shellTransition";
import {
  SHELL_TRANSITION_MIN_DISPLAY_MS,
  setShellTransitionGateListener,
  useShellModeTransition,
} from "./useShellModeTransition";

export interface UseShellModeTransitionOrchestrationDeps {
  showCanvas: ComputedRef<boolean>;
  showStudio: ComputedRef<boolean>;
  stageKey: ComputedRef<string>;
  loadingState: Ref<LoadingState>;
  appRouter: Pick<
    UseAppRouterReturn,
    "isEditing" | "itemType" | "itemSlug" | "editingMode"
  >;
  currentPageSlug: ComputedRef<string | null>;
  currentLayoutSlug: ComputedRef<string | null>;
  currentComponentSlug: ComputedRef<string | null>;
  onStudioShellReady: () => void;
}

export interface UseShellModeTransitionOrchestrationReturn {
  shellTransition: ReturnType<typeof useShellModeTransition>;
  handleStudioReady: () => void;
}

export function shouldRetargetComposerShellTransition(input: {
  isActive: boolean;
  direction: "to-composer" | "to-studio" | null;
}): boolean {
  return input.isActive && input.direction === "to-composer";
}

export function useShellModeTransitionOrchestration(
  deps: UseShellModeTransitionOrchestrationDeps,
): UseShellModeTransitionOrchestrationReturn {
  const shellTransition = useShellModeTransition();
  const { isFullyLoaded } = useAppLoading();

  let studioPaintRafPending = false;
  let minDisplayTimer: ReturnType<typeof setTimeout> | null = null;

  function clearMinDisplayTimer(): void {
    if (minDisplayTimer != null) {
      clearTimeout(minDisplayTimer);
      minDisplayTimer = null;
    }
  }

  function scheduleMinDisplayGateCheck(): void {
    clearMinDisplayTimer();
    if (!shellTransition.isActive.value) {
      return;
    }
    minDisplayTimer = setTimeout(() => {
      minDisplayTimer = null;
      evaluateGates();
    }, SHELL_TRANSITION_MIN_DISPLAY_MS);
  }

  function gateDeps() {
    const editingItemType = deps.appRouter.itemType.value;
    const editingItemSlug = deps.appRouter.itemSlug.value;

    return {
      isLoading: deps.loadingState.value.isLoading,
      loadError: deps.loadingState.value.loadError,
      isEditing: deps.appRouter.isEditing.value,
      showCanvas: deps.showCanvas.value,
      editingItemType,
      editingItemSlug,
      bootComplete: isFullyLoaded.value,
      editorContentAligned: editorContentMatchesTarget({
        editingItemType,
        editingItemSlug,
        currentPageSlug: deps.currentPageSlug.value,
        currentLayoutSlug: deps.currentLayoutSlug.value,
        currentComponentSlug: deps.currentComponentSlug.value,
      }),
    };
  }

  function evaluateGates(): void {
    shellTransition.tryCompleteFromDeps(gateDeps());
  }

  setShellTransitionGateListener(() => {
    evaluateGates();
  });

  function scheduleStudioPaintReady(): void {
    if (studioPaintRafPending) {
      return;
    }
    studioPaintRafPending = true;
    void nextTick().then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          studioPaintRafPending = false;
          shellTransition.markStudioPaintReady();
          evaluateGates();
        });
      });
    });
  }

  function handleStudioReady(): void {
    deps.onStudioShellReady();
    shellTransition.markStudioShellMounted();
    if (deps.showStudio.value) {
      scheduleStudioPaintReady();
    }
    evaluateGates();
  }

  function maybeBeginToComposer(stageKey: string): void {
    if (!isFullyLoaded.value) {
      return;
    }
    if (!deps.showCanvas.value || !deps.appRouter.isEditing.value) {
      return;
    }
    if (stageKey === STAGE_IDLE_KEY) {
      return;
    }
    shellTransition.beginToComposer(stageKey);
    evaluateGates();
  }

  watch(
    () => [deps.showCanvas.value, deps.appRouter.isEditing.value] as const,
    ([showCanvas, isEditing], previous) => {
      const wasCanvas = previous?.[0] ?? false;

      if (showCanvas && isEditing) {
        maybeBeginToComposer(deps.stageKey.value);
        return;
      }

      if (wasCanvas && !showCanvas) {
        shellTransition.beginToStudio();
        evaluateGates();
        return;
      }

      if (showCanvas && !isEditing) {
        shellTransition.cancelTransition();
      }
    },
    { immediate: true },
  );

  watch(
    () => deps.stageKey.value,
    (stageKey, previousKey) => {
      if (stageKey === previousKey) {
        return;
      }
      if (!deps.showCanvas.value || !deps.appRouter.isEditing.value) {
        return;
      }
      if (stageKey === STAGE_IDLE_KEY) {
        shellTransition.cancelTransition();
        return;
      }

      // A stage-key change while Composer is already visible is an item
      // transition, not a shell-mode transition. Keep the full-screen overlay
      // scoped to Studio <-> Composer, while still allowing an in-progress
      // initial entry to retarget if the route changes before it settles.
      if (
        !shouldRetargetComposerShellTransition({
          isActive: shellTransition.isActive.value,
          direction: shellTransition.direction.value,
        })
      ) {
        return;
      }
      maybeBeginToComposer(stageKey);
    },
  );

  watch(
    () => ({
      isLoading: deps.loadingState.value.isLoading,
      loadError: deps.loadingState.value.loadError,
      stageKey: deps.stageKey.value,
      isEditing: deps.appRouter.isEditing.value,
      itemSlug: deps.appRouter.itemSlug.value,
      itemType: deps.appRouter.itemType.value,
      currentPageSlug: deps.currentPageSlug.value,
      currentLayoutSlug: deps.currentLayoutSlug.value,
      currentComponentSlug: deps.currentComponentSlug.value,
      isFullyLoaded: isFullyLoaded.value,
    }),
    () => {
      evaluateGates();
    },
    { deep: true },
  );

  watch(isFullyLoaded, (loaded) => {
    if (!loaded) {
      return;
    }
    if (deps.showCanvas.value && deps.appRouter.isEditing.value) {
      maybeBeginToComposer(deps.stageKey.value);
    }
    evaluateGates();
  });

  watch(
    () => shellTransition.isActive.value,
    (active) => {
      if (active) {
        scheduleMinDisplayGateCheck();
      } else {
        clearMinDisplayTimer();
      }
    },
  );

  watch(
    () => shellTransition.gateSignalVersion.value,
    () => {
      evaluateGates();
    },
  );

  onScopeDispose(() => {
    setShellTransitionGateListener(null);
    clearMinDisplayTimer();
    shellTransition.cancelTransition();
  });

  return {
    shellTransition,
    handleStudioReady,
  };
}
