/**
 * Reactive undo/redo flags from useHistory via window.postMessage (no prop drilling).
 */

import {
  ref,
  onMounted,
  onUnmounted,
  readonly,
  type Ref,
  type DeepReadonly,
} from "vue";
import {
  HistoryChangedMessageSchema,
  type HistoryFailurePayload,
  type HistoryStatePayload,
} from "./useHistory";

export interface OperationSummary {
  type: string;
  description?: string;
  timestamp: number;
  affectedNodeIds?: readonly string[];
}

export interface UseHistoryStateReturn {
  canUndo: DeepReadonly<Ref<boolean>>;
  canRedo: DeepReadonly<Ref<boolean>>;
  stackSize: DeepReadonly<Ref<number>>;
  currentIndex: DeepReadonly<Ref<number>>;
  operations: DeepReadonly<Ref<OperationSummary[]>>;
  undoCount: DeepReadonly<Ref<number>>;
  redoCount: DeepReadonly<Ref<number>>;
  lastFailure: DeepReadonly<Ref<HistoryFailurePayload | null>>;
}

/**
 * Subscribe to history state changes broadcast by useHistory
 *
 * This composable provides reactive state that updates whenever
 * the history changes (execute, undo, redo, clear).
 */
export function useHistoryState(): UseHistoryStateReturn {
  const canUndo = ref(false);
  const canRedo = ref(false);
  const stackSize = ref(0);
  const currentIndex = ref(-1);
  const operations = ref<OperationSummary[]>([]);
  const lastFailure = ref<HistoryFailurePayload | null>(null);

  const undoCount = ref(0);
  const redoCount = ref(0);

  /**
   * Handle history state change message
   */
  function handleMessage(event: MessageEvent): void {
    if (event.origin !== window.location.origin) return;

    const parsedMessage = HistoryChangedMessageSchema.safeParse(event.data);
    if (!parsedMessage.success) {
      return;
    }

    const payload: HistoryStatePayload = parsedMessage.data.payload;

    canUndo.value = payload.canUndo;
    canRedo.value = payload.canRedo;
    stackSize.value = payload.stackSize;
    currentIndex.value = payload.currentIndex;
    operations.value = payload.operations;
    lastFailure.value = payload.lastFailure;

    undoCount.value = payload.currentIndex + 1;
    redoCount.value = payload.stackSize - payload.currentIndex - 1;
  }

  // Subscribe on mount and request current state
  onMounted(() => {
    window.addEventListener("message", handleMessage);

    // Request current state from useHistory
    window.postMessage(
      {
        source: "aria-composer",
        type: "history:request-state",
      },
      window.location.origin,
    );
  });

  // Unsubscribe on unmount
  onUnmounted(() => {
    window.removeEventListener("message", handleMessage);
  });

  return {
    canUndo: readonly(canUndo),
    canRedo: readonly(canRedo),
    stackSize: readonly(stackSize),
    currentIndex: readonly(currentIndex),
    operations: readonly(operations),
    undoCount: readonly(undoCount),
    redoCount: readonly(redoCount),
    lastFailure: readonly(lastFailure),
  };
}
