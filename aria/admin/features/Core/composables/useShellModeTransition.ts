/**
 * Shell mode transition state — Studio ↔ Composer preloader orchestration.
 */

import {
  computed,
  readonly,
  ref,
  type ComputedRef,
  type Ref,
} from "vue";
import { traceStartup } from "@/lib/startupTrace";
import {
  ActiveStageKeySchema,
  BeginShellTransitionInputSchema,
  MarkStageReadyInputSchema,
  STAGE_IDLE_KEY,
  editingModeMatchesStageKey,
  type ShellTransitionDirection,
  type ShellTransitionGateSnapshot,
  type StageKey,
} from "../schemas/shellTransition";

export const SHELL_TRANSITION_MIN_DISPLAY_MS = 200;
export const SHELL_TRANSITION_HARD_TIMEOUT_MS = 10_000;

const isActive = ref(false);
const direction = ref<ShellTransitionDirection | null>(null);
const pendingStageKey = ref<StageKey | null>(null);
const transitionGeneration = ref(0);
const stageReadyForKey = ref<StageKey | null>(null);
const stageReadyGeneration = ref<number | null>(null);
const studioShellMounted = ref(false);
const studioPaintReady = ref(false);
const activeSinceMs = ref<number | null>(null);
const visibleForDismiss = ref(false);
/** Bumped when ready signals change so orchestration re-runs gate checks. */
const gateSignalVersion = ref(0);

let hardTimeoutId: ReturnType<typeof setTimeout> | null = null;
let gateListener: (() => void) | null = null;

function emitGateSignal(): void {
  gateSignalVersion.value += 1;
  gateListener?.();
}

/** Register a listener to re-evaluate transition gates (set from orchestration). */
export function setShellTransitionGateListener(listener: (() => void) | null): void {
  gateListener = listener;
}

function clearHardTimeout(): void {
  if (hardTimeoutId != null) {
    clearTimeout(hardTimeoutId);
    hardTimeoutId = null;
  }
}

function scheduleHardTimeout(): void {
  clearHardTimeout();
  hardTimeoutId = setTimeout(() => {
    traceStartup("shell-transition:timeout", {
      direction: direction.value,
      pendingStageKey: pendingStageKey.value,
      generation: transitionGeneration.value,
    });
    endTransition("timeout");
  }, SHELL_TRANSITION_HARD_TIMEOUT_MS);
}

function resetReadySignals(): void {
  stageReadyForKey.value = null;
  stageReadyGeneration.value = null;
  studioShellMounted.value = false;
  studioPaintReady.value = false;
}

function beginTransition(
  nextDirection: ShellTransitionDirection,
  composerStageKey: StageKey | null,
): void {
  if (nextDirection === "to-composer") {
    if (!composerStageKey) {
      return;
    }
    const inputParsed = BeginShellTransitionInputSchema.safeParse({
      direction: nextDirection,
      pendingStageKey: composerStageKey,
      generation: transitionGeneration.value + 1,
    });
    if (!inputParsed.success) {
      return;
    }
    transitionGeneration.value = inputParsed.data.generation;
    pendingStageKey.value = inputParsed.data.pendingStageKey;
  } else {
    transitionGeneration.value += 1;
    pendingStageKey.value = null;
    resetReadySignals();
  }

  direction.value = nextDirection;
  isActive.value = true;
  visibleForDismiss.value = true;
  activeSinceMs.value = Date.now();

  if (nextDirection === "to-composer") {
    stageReadyForKey.value = null;
    stageReadyGeneration.value = null;
  }

  scheduleHardTimeout();

  traceStartup("shell-transition:begin", {
    direction: nextDirection,
    pendingStageKey: pendingStageKey.value,
    generation: transitionGeneration.value,
  });
}

function endTransition(reason: "complete" | "cancel" | "error" | "timeout"): void {
  if (!isActive.value && reason === "complete") {
    return;
  }

  traceStartup("shell-transition:end", {
    reason,
    direction: direction.value,
    generation: transitionGeneration.value,
  });

  clearHardTimeout();
  isActive.value = false;
  direction.value = null;
  pendingStageKey.value = null;
  resetReadySignals();
  activeSinceMs.value = null;
  visibleForDismiss.value = false;
}

function cancelTransition(): void {
  if (!isActive.value) {
    return;
  }
  endTransition("cancel");
}

function beginToComposer(stageKey: string): void {
  const parsed = ActiveStageKeySchema.safeParse(stageKey);
  if (!parsed.success) {
    return;
  }

  const isSameComposerTarget =
    isActive.value &&
    direction.value === "to-composer" &&
    pendingStageKey.value === parsed.data;

  if (isSameComposerTarget) {
    return;
  }

  if (isActive.value && direction.value === "to-studio") {
    clearHardTimeout();
  }

  beginTransition("to-composer", parsed.data);
}

function beginToStudio(): void {
  if (isActive.value && direction.value === "to-studio") {
    return;
  }
  beginTransition("to-studio", null);
}

function markStageReady(payload: { stageKey: string; generation: number }): void {
  const parsed = MarkStageReadyInputSchema.safeParse(payload);
  if (!parsed.success) {
    if (import.meta.env.DEV) {
      traceStartup("shell-transition:mark-stage-ready:invalid", {
        issues: parsed.error.issues.map((i) => i.message),
      });
    }
    return;
  }

  if (!isActive.value || direction.value !== "to-composer") {
    return;
  }

  if (parsed.data.generation !== transitionGeneration.value) {
    traceStartup("shell-transition:mark-stage-ready:stale-generation", {
      received: parsed.data.generation,
      current: transitionGeneration.value,
    });
    return;
  }

  stageReadyForKey.value = parsed.data.stageKey;
  stageReadyGeneration.value = parsed.data.generation;

  traceStartup("shell-transition:stage-ready", {
    stageKey: parsed.data.stageKey,
    generation: parsed.data.generation,
  });

  emitGateSignal();
}

function markStudioShellMounted(): void {
  studioShellMounted.value = true;
  traceStartup("shell-transition:studio-shell-mounted");
  emitGateSignal();
}

function markStudioPaintReady(): void {
  studioPaintReady.value = true;
  traceStartup("shell-transition:studio-paint-ready");
  emitGateSignal();
}

function minDisplayElapsed(): boolean {
  if (activeSinceMs.value == null) {
    return false;
  }
  return Date.now() - activeSinceMs.value >= SHELL_TRANSITION_MIN_DISPLAY_MS;
}

export function evaluateEnterComposerComplete(
  snapshot: ShellTransitionGateSnapshot,
): boolean {
  if (!snapshot.isActive || snapshot.direction !== "to-composer") {
    return false;
  }

  if (!snapshot.bootComplete) {
    return false;
  }

  if (snapshot.loadError) {
    return false;
  }

  if (snapshot.isLoading) {
    return false;
  }

  if (!snapshot.showCanvas || !snapshot.isEditing) {
    return false;
  }

  if (snapshot.pendingStageKey === STAGE_IDLE_KEY || !snapshot.pendingStageKey) {
    return false;
  }

  if (
    !editingModeMatchesStageKey(
      snapshot.pendingStageKey,
      snapshot.editingItemType,
      snapshot.editingItemSlug,
    )
  ) {
    return false;
  }

  if (
    snapshot.stageReadyForKey !== snapshot.pendingStageKey ||
    snapshot.stageReadyGeneration !== snapshot.transitionGeneration
  ) {
    return false;
  }

  if (!snapshot.minDisplayElapsed) {
    return false;
  }

  if (!snapshot.editorContentAligned) {
    return false;
  }

  return true;
}

export function evaluateExitStudioComplete(
  snapshot: ShellTransitionGateSnapshot,
): boolean {
  if (!snapshot.isActive || snapshot.direction !== "to-studio") {
    return false;
  }

  if (!snapshot.bootComplete) {
    return false;
  }

  if (snapshot.showCanvas) {
    return false;
  }

  if (!snapshot.studioShellMounted || !snapshot.studioPaintReady) {
    return false;
  }

  if (!snapshot.minDisplayElapsed) {
    return false;
  }

  return true;
}

export function tryCompleteTransition(
  snapshot: ShellTransitionGateSnapshot,
): "enter-complete" | "exit-complete" | "error-dismiss" | null {
  if (!snapshot.isActive) {
    return null;
  }

  if (snapshot.direction === "to-composer" && snapshot.loadError) {
    endTransition("error");
    return "error-dismiss";
  }

  if (evaluateEnterComposerComplete(snapshot)) {
    endTransition("complete");
    return "enter-complete";
  }

  if (evaluateExitStudioComplete(snapshot)) {
    endTransition("complete");
    return "exit-complete";
  }

  return null;
}

export interface UseShellModeTransitionReturn {
  readonly isActive: Readonly<Ref<boolean>>;
  readonly gateSignalVersion: Readonly<Ref<number>>;
  readonly isOverlayVisible: Readonly<Ref<boolean>>;
  readonly direction: Readonly<Ref<ShellTransitionDirection | null>>;
  readonly pendingStageKey: Readonly<Ref<StageKey | null>>;
  readonly transitionGeneration: Readonly<Ref<number>>;
  readonly isEnteringComposer: ComputedRef<boolean>;
  readonly hideCanvasUntilReady: ComputedRef<boolean>;
  beginToComposer: (stageKey: string) => void;
  beginToStudio: () => void;
  cancelTransition: () => void;
  markStageReady: (payload: { stageKey: string; generation: number }) => void;
  markStudioShellMounted: () => void;
  markStudioPaintReady: () => void;
  notifyOverlayHidden: () => void;
  buildGateSnapshot: (deps: ShellTransitionGateDeps) => ShellTransitionGateSnapshot;
  tryCompleteFromDeps: (deps: ShellTransitionGateDeps) => ReturnType<
    typeof tryCompleteTransition
  >;
}

export interface ShellTransitionGateDeps {
  isLoading: boolean;
  loadError: string | null;
  isEditing: boolean;
  showCanvas: boolean;
  editingItemType: ShellTransitionGateSnapshot["editingItemType"];
  editingItemSlug: string | null;
  bootComplete: boolean;
  editorContentAligned: boolean;
}

export function useShellModeTransition(): UseShellModeTransitionReturn {
  const isEnteringComposer = computed(
    () => isActive.value && direction.value === "to-composer",
  );

  const hideCanvasUntilReady = computed(
    () => isActive.value && direction.value === "to-composer" && visibleForDismiss.value,
  );

  function buildGateSnapshot(deps: ShellTransitionGateDeps): ShellTransitionGateSnapshot {
    return {
      isActive: isActive.value,
      direction: direction.value,
      pendingStageKey: pendingStageKey.value,
      transitionGeneration: transitionGeneration.value,
      stageReadyForKey: stageReadyForKey.value,
      stageReadyGeneration: stageReadyGeneration.value,
      studioShellMounted: studioShellMounted.value,
      studioPaintReady: studioPaintReady.value,
      isLoading: deps.isLoading,
      loadError: deps.loadError,
      isEditing: deps.isEditing,
      showCanvas: deps.showCanvas,
      editingItemType: deps.editingItemType,
      editingItemSlug: deps.editingItemSlug,
      bootComplete: deps.bootComplete,
      minDisplayElapsed: minDisplayElapsed(),
      editorContentAligned: deps.editorContentAligned,
    };
  }

  function tryCompleteFromDeps(
    deps: ShellTransitionGateDeps,
  ): ReturnType<typeof tryCompleteTransition> {
    const snapshot = buildGateSnapshot(deps);
    const result = tryCompleteTransition(snapshot);
    if (result === "enter-complete" || result === "exit-complete") {
      traceStartup("shell-transition:gate-pass", {
        result,
        pendingStageKey: snapshot.pendingStageKey,
      });
    }
    return result;
  }

  function notifyOverlayHidden(): void {
    visibleForDismiss.value = false;
  }

  return {
    isActive: readonly(isActive),
    gateSignalVersion: readonly(gateSignalVersion),
    isOverlayVisible: readonly(visibleForDismiss),
    direction: readonly(direction),
    pendingStageKey: readonly(pendingStageKey),
    transitionGeneration: readonly(transitionGeneration),
    isEnteringComposer,
    hideCanvasUntilReady,
    beginToComposer,
    beginToStudio,
    cancelTransition,
    markStageReady,
    markStudioShellMounted,
    markStudioPaintReady,
    notifyOverlayHidden,
    buildGateSnapshot,
    tryCompleteFromDeps,
  };
}

/** Test-only reset */
export function __resetShellModeTransitionForTests(): void {
  clearHardTimeout();
  gateListener = null;
  gateSignalVersion.value = 0;
  isActive.value = false;
  direction.value = null;
  pendingStageKey.value = null;
  transitionGeneration.value = 0;
  resetReadySignals();
  activeSinceMs.value = null;
  visibleForDismiss.value = false;
}
