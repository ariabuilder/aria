/**
 * History Feature Module history panel UI and state management for
 * undo/redo operations. Uses signal-based communication for decoupled state updates.
 */

export { default as HistoryPanel } from "./components/HistoryPanel.vue";

export { useHistory } from "./composables/useHistory";
export { useHistoryState } from "./composables/useHistoryState";
export { useHistoryControls } from "./composables/useHistoryControls";
export {
  recordStateSnapshot,
  recordStateSnapshotAdvanced,
} from "./composables/useHistory";

export type {
  Operation,
  OperationType,
  ExecuteResult,
  HistoryState,
  HistoryStats,
  HistoryStatePayload,
  HistoryFailurePayload,
} from "./composables/useHistory";
export type {
  OperationSummary,
  UseHistoryStateReturn,
} from "./composables/useHistoryState";
