/**
 * In-memory undo/redo stack for the builder (command pattern).
 * New operations truncate the redo branch; flags guard re-entrancy.
 */

import {
  ref,
  computed,
  readonly,
  type Ref,
  type ComputedRef,
  type DeepReadonly,
} from "vue";
import { z } from "zod";
import { eventBus } from "../../../../lib/events/eventBus";
import type { HistoryEvent } from "../../../../lib/events/types";
import { log } from "@/lib/utils/logger";

function deepCloneValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

/**
 * History state broadcast payload
 * Sent via window.postMessage when history changes
 */
export interface HistoryStatePayload {
  canUndo: boolean;
  canRedo: boolean;
  stackSize: number;
  currentIndex: number;
  lastFailure: HistoryFailurePayload | null;
  operations: {
    type: string;
    description?: string;
    timestamp: number;
    affectedNodeIds?: readonly string[];
  }[];
}

export interface HistoryFailurePayload {
  phase: "execute" | "undo" | "redo";
  message: string;
  timestamp: number;
  operationType?: string;
  operationDescription?: string;
}

const HISTORY_OPERATION_TYPES = [
  "update-node",
  "insert-node",
  "delete-node",
  "move-node",
  "reorder-nodes",
  "update-node-styles",
  "update-node-props",
  "batch-nodes",
  "update-page-dsl",
  "create-page",
  "delete-page",
  "delete-pages-batch",
  "rename-page",
  "duplicate-page",
  "restore-page-version",
  "update-layout-dsl",
  "update-layout-metadata",
  "create-layout",
  "delete-layout",
  "rename-layout",
  "duplicate-layout",
  "update-component-dsl",
  "create-component",
  "delete-component",
  "delete-components-batch",
  "rename-component",
  "duplicate-component",
  "create-cms-entry",
  "update-cms-entry",
  "delete-cms-entry",
  "delete-cms-entries-batch",
  "duplicate-cms-entry",
  "duplicate-cms-entries-batch",
  "publish-cms-entry",
  "unpublish-cms-entry",
  "archive-cms-entry",
  "restore-cms-entry-revision",
  "update-design-colors",
  "apply-palette-template",
  "add-palette",
  "remove-palette",
  "update-palette",
  "rename-palette",
  "update-semantic-color",
  "import-design-system",
  "reset-global-variables",
  "create-global-variable",
  "delete-global-variable",
  "rename-global-variable",
  "duplicate-global-variable",
  "create-global-alias",
  "delete-global-alias",
  "rename-global-alias",
  "duplicate-global-alias",
  "delete-global-variables",
  "delete-global-aliases",
  "import-global-variables",
  "add-utility-class",
  "remove-utility-class",
  "add-custom-class",
  "remove-custom-class",
  "create-custom-class",
  "delete-custom-class",
  "rename-custom-class",
  "duplicate-custom-class",
  "replace-class-styles",
  "replace-class-variant-rules",
  "delete-custom-classes",
  "set-authoring-mode",
  "set-framework-mode",
  "update-class-rule",
  "remove-class-rule",
  "update-class-pseudo-rule",
  "remove-class-pseudo-rule",
  "media-upload",
  "media-upload-failed",
  "media-rename",
  "media-rename-failed",
  "media-delete",
  "media-delete-failed",
  "media-duplicate",
  "media-duplicate-failed",
  "create-component-group",
  "rename-component-group",
  "delete-component-group",
  "move-component-group",
  "create-media-group",
  "rename-media-group",
  "delete-media-group",
  "move-media-group",
] as const;

export const HistoryOperationTypeSchema = z.enum(HISTORY_OPERATION_TYPES);

const HistoryAffectedNodeIdsSchema = z
  .array(z.string().trim().min(1))
  .readonly();

const HistoryOperationGroupSchema = z
  .object({
    key: z.string().trim().min(1),
    windowMs: z.int().positive().optional(),
  })
  .strict();

const HistoryOperationMetadataSchema = z
  .object({
    type: HistoryOperationTypeSchema,
    timestamp: z.number(),
    description: z.string().optional(),
    affectedNodeIds: HistoryAffectedNodeIdsSchema.optional(),
    group: HistoryOperationGroupSchema.optional(),
  })
  .strict();

const HistoryOperationSummarySchema = z
  .object({
    type: HistoryOperationTypeSchema,
    description: z.string().min(1).optional(),
    timestamp: z.number(),
    affectedNodeIds: HistoryAffectedNodeIdsSchema.optional(),
  })
  .strict();

export const HistoryFailurePayloadSchema = z
  .object({
    phase: z.enum(["execute", "undo", "redo"]),
    message: z.string(),
    timestamp: z.number(),
    operationType: HistoryOperationTypeSchema.optional(),
    operationDescription: z.string().optional(),
  })
  .strict();

export const HistoryStatePayloadSchema = z
  .object({
    canUndo: z.boolean(),
    canRedo: z.boolean(),
    stackSize: z.int().nonnegative(),
    currentIndex: z.int(),
    lastFailure: HistoryFailurePayloadSchema.nullable(),
    operations: z.array(HistoryOperationSummarySchema),
  })
  .strict();

export const HistoryChangedMessageSchema = z
  .object({
    source: z.literal("aria-composer"),
    type: z.literal("history:changed"),
    payload: HistoryStatePayloadSchema,
  })
  .strict();

export const HistoryRequestStateMessageSchema = z
  .object({
    source: z.literal("aria-composer"),
    type: z.literal("history:request-state"),
  })
  .strict();

export type OperationType = z.infer<typeof HistoryOperationTypeSchema>;

const OPERATION_LABELS: Record<OperationType, string> = {
  "update-node": "Edit Node",
  "insert-node": "Insert Node",
  "delete-node": "Delete Node",
  "move-node": "Move Node",
  "reorder-nodes": "Reorder Nodes",
  "update-node-styles": "Update Styles",
  "update-node-props": "Update Properties",
  "batch-nodes": "Batch Node Update",
  "update-page-dsl": "Update Page",
  "create-page": "Create Page",
  "delete-page": "Delete Page",
  "delete-pages-batch": "Delete Pages",
  "rename-page": "Rename Page",
  "duplicate-page": "Duplicate Page",
  "restore-page-version": "Restore Page Version",
  "update-layout-dsl": "Update Layout",
  "update-layout-metadata": "Update Layout Metadata",
  "create-layout": "Create Layout",
  "delete-layout": "Delete Layout",
  "rename-layout": "Rename Layout",
  "duplicate-layout": "Duplicate Layout",
  "update-component-dsl": "Update Component",
  "create-component": "Create Component",
  "delete-component": "Delete Component",
  "delete-components-batch": "Delete Components",
  "rename-component": "Rename Component",
  "duplicate-component": "Duplicate Component",
  "create-cms-entry": "Create CMS Entry",
  "update-cms-entry": "Update CMS Entry",
  "delete-cms-entry": "Delete CMS Entry",
  "delete-cms-entries-batch": "Delete CMS Entries",
  "duplicate-cms-entry": "Duplicate CMS Entry",
  "duplicate-cms-entries-batch": "Duplicate CMS Entries",
  "publish-cms-entry": "Publish CMS Entry",
  "unpublish-cms-entry": "Unpublish CMS Entry",
  "archive-cms-entry": "Archive CMS Entry",
  "restore-cms-entry-revision": "Restore CMS Entry Revision",
  "update-design-colors": "Update Design Colors",
  "apply-palette-template": "Apply Palette Template",
  "add-palette": "Add Palette",
  "remove-palette": "Remove Palette",
  "update-palette": "Update Palette",
  "rename-palette": "Rename Palette",
  "update-semantic-color": "Update Semantic Color",
  "import-design-system": "Import Design System",
  "reset-global-variables": "Reset Variables",
  "create-global-variable": "Create Variable",
  "delete-global-variable": "Delete Variable",
  "rename-global-variable": "Rename Variable",
  "duplicate-global-variable": "Duplicate Variable",
  "create-global-alias": "Create Alias",
  "delete-global-alias": "Delete Alias",
  "rename-global-alias": "Rename Alias",
  "duplicate-global-alias": "Duplicate Alias",
  "delete-global-variables": "Delete Variables",
  "delete-global-aliases": "Delete Aliases",
  "import-global-variables": "Import Variables",
  "add-utility-class": "Add Utility Class",
  "remove-utility-class": "Remove Utility Class",
  "add-custom-class": "Add Custom Class",
  "remove-custom-class": "Remove Custom Class",
  "create-custom-class": "Create Custom Class",
  "delete-custom-class": "Delete Custom Class",
  "rename-custom-class": "Rename Custom Class",
  "duplicate-custom-class": "Duplicate Custom Class",
  "replace-class-styles": "Replace Class Styles",
  "replace-class-variant-rules": "Replace Class Variant CSS",
  "delete-custom-classes": "Delete Custom Classes",
  "set-authoring-mode": "Set Authoring Mode",
  "set-framework-mode": "Set Framework Mode",
  "update-class-rule": "Update Class Rule",
  "remove-class-rule": "Remove Class Rule",
  "update-class-pseudo-rule": "Update Class Pseudo Rule",
  "remove-class-pseudo-rule": "Remove Class Pseudo Rule",
  "media-upload": "Upload Media",
  "media-upload-failed": "Media Upload Failed",
  "media-rename": "Rename Media",
  "media-rename-failed": "Media Rename Failed",
  "media-delete": "Delete Media",
  "media-delete-failed": "Media Delete Failed",
  "media-duplicate": "Duplicate Media",
  "media-duplicate-failed": "Media Duplicate Failed",
  "create-component-group": "Create Component Group",
  "rename-component-group": "Rename Component Group",
  "delete-component-group": "Delete Component Group",
  "move-component-group": "Move Component Between Groups",
  "create-media-group": "Create Media Folder",
  "rename-media-group": "Rename Media Folder",
  "delete-media-group": "Delete Media Folder",
  "move-media-group": "Move Media Between Folders",
};

export function getOperationLabel(type: string): string {
  const knownLabel = OPERATION_LABELS[type as OperationType];

  if (knownLabel) {
    return knownLabel;
  }

  return type.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveOperationDescription(
  operation: Pick<Operation, "type" | "description">,
): string {
  const providedDescription = operation.description?.trim();

  if (providedDescription && providedDescription.length > 0) {
    return providedDescription;
  }

  return getOperationLabel(operation.type);
}

/**
 * Reversible operation with undo/redo functions
 *
 * Each operation must provide both undo and redo implementations.
 * Operations can be async to support server actions, DOM updates, etc.
 */
export interface Operation {
  readonly type: OperationType;
  readonly undo: () => void | Promise<void>;
  /** Redo function - re-applies the operation */
  readonly redo: () => void | Promise<void>;
  readonly timestamp: number;
  readonly description?: string;
  readonly affectedNodeIds?: readonly string[];
  readonly group?: {
    key: string;
    windowMs?: number;
  };
}

/**
 * Operation execution result
 */
export interface ExecuteResult {
  readonly success: boolean;
  readonly error?: Error;
}

export interface HistoryState {
  readonly stackSize: number;
  readonly currentIndex: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isOperationInProgress: boolean;
  readonly remainingCapacity: number;
}

/**
 * History statistics
 */
export interface HistoryStats {
  readonly totalOperations: number;
  readonly currentPosition: number;
  readonly forwardHistorySize: number;
  readonly backwardHistorySize: number;
  readonly oldestTimestamp: number | null;
  readonly newestTimestamp: number | null;
}

/**
 * Composable return type
 */
interface UseHistoryReturn {
  /** Can undo (has history and not in operation) */
  readonly canUndo: ComputedRef<boolean>;
  /** Can redo (has forward history and not in operation) */
  readonly canRedo: ComputedRef<boolean>;
  /** Currently executing undo */
  readonly isUndoing: DeepReadonly<Ref<boolean>>;
  /** Currently executing redo */
  readonly isRedoing: DeepReadonly<Ref<boolean>>;
  /** Any operation in progress */
  readonly isOperationInProgress: ComputedRef<boolean>;
  readonly stackSize: ComputedRef<number>;
  readonly currentPosition: ComputedRef<number>;
  readonly lastFailure: DeepReadonly<Ref<HistoryFailurePayload | null>>;
  readonly execute: (operation: Operation) => Promise<ExecuteResult>;
  readonly undo: () => Promise<void>;
  readonly redo: () => Promise<void>;
  readonly clear: () => void;
  readonly getState: () => HistoryState;
  /** Get history statistics */
  readonly getStats: () => HistoryStats;
  readonly getOperationAt: (index: number) => Operation | null;
  readonly jumpTo: (index: number) => Promise<void>;
  /** Clear failure diagnostics */
  readonly clearLastFailure: () => void;
}

/** Maximum number of operations to keep in memory */
const MAX_HISTORY_SIZE = 50 as const;

const EMPTY_HISTORY_INDEX = -1 as const;

const UNKNOWN_NODE_ID = "unknown" as const;

const EVENT_SOURCE = "history" as const;

/** History stack (singleton across all instances) */
const historyStack = ref<Operation[]>([]);

const currentIndex = ref<number>(EMPTY_HISTORY_INDEX);

/** Undo operation in progress flag */
const isUndoing = ref<boolean>(false);

/** Redo operation in progress flag */
const isRedoing = ref<boolean>(false);

/** Last execution/undo/redo failure for diagnostics */
const lastFailure = ref<HistoryFailurePayload | null>(null);

/** Flag to track if request listener is set up */
let requestListenerSetup = false;

/**
 * Validate operation structure
 */
function normalizeOperation(operation: unknown): Operation | null {
  if (typeof operation !== "object" || operation === null) {
    return null;
  }

  const candidate = operation as Partial<Operation>;
  if (
    typeof candidate.undo !== "function" ||
    typeof candidate.redo !== "function"
  ) {
    return null;
  }

  const parsedMetadata = HistoryOperationMetadataSchema.safeParse({
    type: candidate.type,
    timestamp: candidate.timestamp,
    description: candidate.description,
    affectedNodeIds: candidate.affectedNodeIds,
    group: candidate.group,
  });

  if (!parsedMetadata.success) {
    log("warn", "[useHistory] Invalid operation metadata", {
      issues: parsedMetadata.error.issues,
    });
    return null;
  }

  return {
    ...parsedMetadata.data,
    undo: candidate.undo,
    redo: candidate.redo,
  };
}

function isValidIndex(index: number): boolean {
  return (
    typeof index === "number" &&
    !isNaN(index) &&
    isFinite(index) &&
    Number.isInteger(index) &&
    index >= EMPTY_HISTORY_INDEX
  );
}

/**
 * Check if index is within stack bounds
 */
function isIndexInBounds(index: number, stackLength: number): boolean {
  return index >= 0 && index < stackLength;
}

/**
 * Check if any operation is in progress
 */
function hasOperationInProgress(): boolean {
  return isUndoing.value || isRedoing.value;
}

function canPerformUndo(): boolean {
  return currentIndex.value >= 0 && !hasOperationInProgress();
}

function canPerformRedo(): boolean {
  return (
    currentIndex.value < historyStack.value.length - 1 &&
    !hasOperationInProgress()
  );
}

/**
 * Truncate forward history
 *
 * Called when executing new operation while in middle of stack.
 * Removes all operations after current position.
 */
function truncateForwardHistory(): void {
  if (currentIndex.value < historyStack.value.length - 1) {
    historyStack.value = historyStack.value.slice(0, currentIndex.value + 1);
    log("debug", "[useHistory] Truncated forward history", {
      stackSize: historyStack.value.length,
    });
  }
}

function addOperationToStack(operation: Operation): void {
  historyStack.value.push(operation);
  currentIndex.value++;
  log("debug", "[useHistory] Added operation", {
    type: operation.type,
    description: operation.description || "no description",
    index: currentIndex.value,
    stackSize: historyStack.value.length,
  });
}

/**
 * Replace current operation in stack (used for grouped rapid edits)
 */
function replaceCurrentOperation(operation: Operation): void {
  if (
    currentIndex.value < 0 ||
    currentIndex.value >= historyStack.value.length
  ) {
    addOperationToStack(operation);
    return;
  }

  const previousOperation = historyStack.value[currentIndex.value];

  historyStack.value[currentIndex.value] = {
    ...operation,
    undo: previousOperation.undo,
  };

  log("debug", "[useHistory] Grouped operation replaced", {
    index: currentIndex.value,
    type: operation.type,
    description: operation.description,
    groupKey: operation.group?.key,
  });
}

/**
 * Determine whether two operations should be grouped
 */
function shouldGroupWithPrevious(operation: Operation): boolean {
  if (!operation.group || currentIndex.value < 0) {
    return false;
  }

  const previous = historyStack.value[currentIndex.value];
  if (!previous?.group) {
    return false;
  }

  const maxWindowMs = operation.group.windowMs ?? 700;
  const isWithinWindow =
    operation.timestamp - previous.timestamp <= maxWindowMs;

  return (
    previous.type === operation.type &&
    previous.group.key === operation.group.key &&
    isWithinWindow
  );
}

/**
 * Enforce stack size limit
 *
 * Removes oldest operations when stack exceeds MAX_HISTORY_SIZE.
 */
function enforceStackLimit(): void {
  if (historyStack.value.length > MAX_HISTORY_SIZE) {
    const removed = historyStack.value.shift();
    currentIndex.value--;
    log("debug", "[useHistory] Removed oldest operation", {
      type: removed?.type,
      newSize: historyStack.value.length,
    });
  }
}

function resetStack(): void {
  historyStack.value = [];
  currentIndex.value = EMPTY_HISTORY_INDEX;
  log("debug", "[useHistory] Stack cleared");
}

function emitHistoryEvent(
  eventType: "history:undo" | "history:redo",
  operation: Operation,
): void {
  try {
    const event: HistoryEvent = {
      type: eventType,
      nodeId: operation.affectedNodeIds?.[0] || UNKNOWN_NODE_ID,
      timestamp: Date.now(),
      source: EVENT_SOURCE,
      payload: { operation },
    };

    eventBus.emit(event);

    log("debug", `[useHistory] Emitted ${eventType} event`, {
      operation: operation.type,
      nodeId: operation.affectedNodeIds?.[0],
    });
  } catch (error) {
    log("warn", `[useHistory] Failed to emit ${eventType} event`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function getOperationAtIndex(index: number): Operation | null {
  if (!isValidIndex(index)) return null;
  if (!isIndexInBounds(index, historyStack.value.length)) return null;

  return historyStack.value[index] || null;
}

function calculateRemainingCapacity(): number {
  return Math.max(0, MAX_HISTORY_SIZE - historyStack.value.length);
}

function getOldestTimestamp(): number | null {
  if (historyStack.value.length === 0) return null;
  return historyStack.value[0]?.timestamp || null;
}

function getNewestTimestamp(): number | null {
  if (historyStack.value.length === 0) return null;
  const last = historyStack.value[historyStack.value.length - 1];
  return last?.timestamp || null;
}

/**
 * Create execution result
 */
function createExecuteResult(success: boolean, error?: Error): ExecuteResult {
  return { success, error };
}

function clearFailureState(): void {
  lastFailure.value = null;
}

function setFailureState(
  phase: HistoryFailurePayload["phase"],
  message: string,
  operation?: Operation,
): void {
  lastFailure.value = {
    phase,
    message,
    timestamp: Date.now(),
    operationType: operation?.type,
    operationDescription: operation
      ? resolveOperationDescription(operation)
      : undefined,
  };
}

function createHistoryState(): HistoryState {
  return {
    stackSize: historyStack.value.length,
    currentIndex: currentIndex.value,
    canUndo: canPerformUndo(),
    canRedo: canPerformRedo(),
    isOperationInProgress: hasOperationInProgress(),
    remainingCapacity: calculateRemainingCapacity(),
  };
}

/**
 * Create history statistics
 */
function createHistoryStats(): HistoryStats {
  const forwardSize =
    currentIndex.value < historyStack.value.length - 1
      ? historyStack.value.length - 1 - currentIndex.value
      : 0;
  const backwardSize = currentIndex.value + 1;

  return {
    totalOperations: historyStack.value.length,
    currentPosition: currentIndex.value,
    forwardHistorySize: forwardSize,
    backwardHistorySize: backwardSize,
    oldestTimestamp: getOldestTimestamp(),
    newestTimestamp: getNewestTimestamp(),
  };
}

/**
 * Broadcast history state change via window. postMessage This allows any
 * component to subscribe to history state changes without prop drilling.
 */
function broadcastHistoryState(): void {
  // Create plain serializable payload - postMessage cannot clone functions or Proxies
  const operations = historyStack.value.map((op) => ({
    type: op.type,
    description: resolveOperationDescription(op),
    timestamp: op.timestamp,
    // Convert to plain array to avoid Proxy serialization issues
    affectedNodeIds: op.affectedNodeIds ? [...op.affectedNodeIds] : undefined,
  }));

  const payloadParse = HistoryStatePayloadSchema.safeParse({
    canUndo: canPerformUndo(),
    canRedo: canPerformRedo(),
    stackSize: historyStack.value.length,
    currentIndex: currentIndex.value,
    lastFailure: lastFailure.value ? { ...lastFailure.value } : null,
    operations,
  });

  if (!payloadParse.success) {
    log("warn", "[useHistory] Failed to serialize history state payload", {
      issues: payloadParse.error.issues,
    });
    return;
  }

  const messageParse = HistoryChangedMessageSchema.safeParse({
    source: "aria-composer",
    type: "history:changed",
    payload: payloadParse.data,
  });

  if (!messageParse.success) {
    log("warn", "[useHistory] Failed to serialize history state message", {
      issues: messageParse.error.issues,
    });
    return;
  }

  // Broadcast to all listeners in same window
  window.postMessage(messageParse.data, window.location.origin);

  log("debug", "[useHistory] Broadcast state", {
    canUndo: payloadParse.data.canUndo,
    canRedo: payloadParse.data.canRedo,
    stackSize: payloadParse.data.stackSize,
    currentIndex: payloadParse.data.currentIndex,
  });
}

function handleStateRequest(event: MessageEvent): void {
  if (event.origin !== window.location.origin) return;

  const parsedMessage = HistoryRequestStateMessageSchema.safeParse(event.data);
  if (!parsedMessage.success) {
    return;
  }

  broadcastHistoryState();
}

/**
 * Set up request listener (only once)
 */
function setupRequestListener(): void {
  if (requestListenerSetup) return;
  requestListenerSetup = true;

  if (typeof window !== "undefined") {
    window.addEventListener("message", handleStateRequest);
  }
}

/**
 * Record operation using before/after state snapshots
 *
 * This is the most efficient way to add history to operations.
 * Instead of manually defining undo/redo, automatically compare states.
 *
 * ```typescript
 * await recordStateSnapshot({
 *   type: "create-custom-class",
 *   description: `Create class: ${name}`,
 *   captureState: () => ({ classes: customClasses.value }),
 *   action: () => actions.styles.createClass({ name, description }),
 * });
 * ```
 *
 * @param options - Configuration for snapshot recording
 * @returns Result of the action
 */
export async function recordStateSnapshot<T>({
  type,
  description,
  captureState,
  action,
  applySnapshot,
  group,
  affectedNodeIds,
}: {
  type: OperationType;
  description: string;
  captureState: () => Record<string, unknown>;
  action: () => Promise<T>;
  /** Apply a full snapshot object back to reactive state */
  applySnapshot?: (snapshot: Record<string, unknown>) => void | Promise<void>;
  group?: {
    key: string;
    windowMs?: number;
  };
  affectedNodeIds?: string[];
}): Promise<T> {
  const { execute: executeHistory } = useHistory();

  const beforeState = deepCloneValue(captureState());

  const result = await action();

  const afterState = deepCloneValue(captureState());

  // Record to history
  await executeHistory({
    type,
    timestamp: Date.now(),
    description,
    affectedNodeIds,
    group,
    undo: async () => {
      if (applySnapshot) {
        await applySnapshot(deepCloneValue(beforeState));
      }
    },
    redo: async () => {
      if (applySnapshot) {
        await applySnapshot(deepCloneValue(afterState));
      }
    },
  });

  return result;
}

/**
 * Advanced state snapshot recording with custom property restoration For cases
 * where you need more control over which properties to restore.
 */
export async function recordStateSnapshotAdvanced<T>({
  type,
  description,
  captureState,
  action,
  restoreProperty,
  group,
  affectedNodeIds,
}: {
  type: OperationType;
  description: string;
  captureState: () => Record<string, unknown>;
  action: () => Promise<T>;
  restoreProperty?: (
    state: Record<string, unknown>,
    property: string,
    value: unknown,
  ) => void | Promise<void>;
  group?: {
    key: string;
    windowMs?: number;
  };
  affectedNodeIds?: string[];
}): Promise<T> {
  const { execute: executeHistory } = useHistory();

  const beforeState = deepCloneValue(captureState());

  const result = await action();

  const afterState = deepCloneValue(captureState());

  // Record to history
  await executeHistory({
    type,
    timestamp: Date.now(),
    description,
    affectedNodeIds,
    group,
    undo: async () => {
      for (const [property, value] of Object.entries(beforeState)) {
        if (restoreProperty) {
          await restoreProperty(beforeState, property, deepCloneValue(value));
        } else {
          const ref = beforeState as Record<string, unknown>;
          ref[property] = deepCloneValue(value);
        }
      }
    },
    redo: async () => {
      for (const [property, value] of Object.entries(afterState)) {
        if (restoreProperty) {
          await restoreProperty(afterState, property, deepCloneValue(value));
        } else {
          const ref = afterState as Record<string, unknown>;
          ref[property] = deepCloneValue(value);
        }
      }
    },
  });

  return result;
}

/**
 * Undo/redo stack with size limits, async support, and event-bus integration.
 * In-memory singleton shared across callers.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useHistory } from '@/composables/useHistory';
 *
 * const {
 *   canUndo,
 *   canRedo,
 *   execute,
 *   undo,
 *   redo,
 *   clear,
 *   getState
 * } = useHistory();
 *
 * // Execute reversible operation
 * async function updateNode(nodeId: string, newProps: Record<string, unknown>) {
 *   const oldProps = { ...node.props };
 *
 *   await execute({
 *     type: 'update-node-props',
 *     timestamp: Date.now(),
 *     description: `Update props for ${nodeId}`,
 *     affectedNodeIds: [nodeId],
 *     redo: async () => {
 *       node.props = newProps;
 *       await saveToServer();
 *     },
 *     undo: async () => {
 *       node.props = oldProps;
 *       await saveToServer();
 *     }
 *   });
 * }
 *
 * // Keyboard shortcuts
 * onKeydown((e) => {
 *   if (e.metaKey && e.key === 'z' && !e.shiftKey) {
 *     if (canUndo.value) undo();
 *   }
 *   if ((e.metaKey && e.shiftKey && e.key === 'z') || (e.metaKey && e.key === 'y')) {
 *     if (canRedo.value) redo();
 *   }
 * });
 *
 * // Clear on page change
 * watch(currentPageId, () => {
 *   clear();
 * });
 * </script>
 * ```
 */
export function useHistory(): UseHistoryReturn {
  // Set up request listener (once)
  setupRequestListener();

  /**
   * Can undo (has backward history and no operation in progress)
   */
  const canUndo = computed<boolean>(() => canPerformUndo());

  /**
   * Can redo (has forward history and no operation in progress)
   */
  const canRedo = computed<boolean>(() => canPerformRedo());

  /**
   * Any operation in progress (undo or redo)
   */
  const isOperationInProgress = computed<boolean>(() =>
    hasOperationInProgress(),
  );

  /**
   * Current stack size
   */
  const stackSize = computed<number>(() => historyStack.value.length);

  /**
   * Current position in stack
   */
  const currentPosition = computed<number>(() => currentIndex.value);

  /**
   * Execute new operation and add to history
   *
   * Steps:
   * 1. Truncate forward history if in middle of stack
   * 2. Execute operation's redo() function
   * 3. Add operation to stack
   * 4. Enforce size limits
   *
   * @param operation - Operation to execute
   * @returns Execution result with success flag and optional error
   */
  async function execute(operation: Operation): Promise<ExecuteResult> {
    const baseOperation = normalizeOperation(operation);

    if (!baseOperation) {
      log("error", "[useHistory] Invalid operation", { operation });
      setFailureState("execute", "Invalid operation payload");
      broadcastHistoryState();
      return createExecuteResult(false, new Error("Invalid operation"));
    }

    if (hasOperationInProgress()) {
      log("warn", "[useHistory] Cannot execute: operation in progress");
      setFailureState("execute", "Operation already in progress", operation);
      broadcastHistoryState();
      return createExecuteResult(
        false,
        new Error("Operation already in progress"),
      );
    }

    const normalizedOperation: Operation = {
      ...baseOperation,
      description: resolveOperationDescription(baseOperation),
    };

    truncateForwardHistory();

    try {
      await normalizedOperation.redo();
      clearFailureState();

      log("debug", "[useHistory] Executed operation", {
        type: normalizedOperation.type,
        description: normalizedOperation.description,
        affectedNodes: normalizedOperation.affectedNodeIds,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", "[useHistory] Operation execution failed", {
        error: message,
      });
      setFailureState("execute", message, normalizedOperation);
      broadcastHistoryState();
      return createExecuteResult(
        false,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    // Add to stack (or replace when grouped)
    if (shouldGroupWithPrevious(normalizedOperation)) {
      replaceCurrentOperation(normalizedOperation);
    } else {
      addOperationToStack(normalizedOperation);
    }

    enforceStackLimit();

    broadcastHistoryState();

    return createExecuteResult(true);
  }

  /**
   * /** Undo last operation Steps: 1. Validate can undo 2.
   */
  async function undo(): Promise<void> {
    if (!canPerformUndo()) {
      log("debug", "[useHistory] Cannot undo", {
        currentIndex: currentIndex.value,
        isOperationInProgress: hasOperationInProgress(),
      });
      return;
    }

    isUndoing.value = true;

    try {
      const operation = historyStack.value[currentIndex.value];

      if (!operation) {
        throw new Error("Operation not found at current index");
      }

      emitHistoryEvent("history:undo", operation);

      await operation.undo();
      clearFailureState();

      currentIndex.value--;

      log("debug", "[useHistory] Undone operation", {
        type: operation.type,
        newIndex: currentIndex.value,
      });

      broadcastHistoryState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", "[useHistory] Undo failed", {
        error: message,
      });
      const failedOperation =
        historyStack.value[currentIndex.value] || undefined;
      setFailureState("undo", message, failedOperation);
      broadcastHistoryState();
    } finally {
      isUndoing.value = false;
    }
  }

  /**
   * /** Redo next operation Steps: 1. Validate can redo 2.
   */
  async function redo(): Promise<void> {
    if (!canPerformRedo()) {
      log("debug", "[useHistory] Cannot redo", {
        currentIndex: currentIndex.value,
        stackLength: historyStack.value.length,
        isOperationInProgress: hasOperationInProgress(),
      });
      return;
    }

    isRedoing.value = true;

    try {
      currentIndex.value++;

      const operation = historyStack.value[currentIndex.value];

      if (!operation) {
        throw new Error("Operation not found at incremented index");
      }

      emitHistoryEvent("history:redo", operation);

      await operation.redo();
      clearFailureState();

      log("debug", "[useHistory] Redone operation", {
        type: operation.type,
        newIndex: currentIndex.value,
      });

      broadcastHistoryState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", "[useHistory] Redo failed", {
        error: message,
      });
      const failedOperation =
        historyStack.value[currentIndex.value] || undefined;
      setFailureState("redo", message, failedOperation);
      // Revert index on failure
      currentIndex.value--;
      broadcastHistoryState();
    } finally {
      isRedoing.value = false;
    }
  }

  /**
   * Clear all history
   *
   * Useful when switching pages/contexts to avoid applying
   * operations from previous context.
   */
  function clear(): void {
    resetStack();
    clearFailureState();
    broadcastHistoryState();
  }

  function clearLastFailure(): void {
    clearFailureState();
    broadcastHistoryState();
  }

  /**
   * Get current history state snapshot
   *
   * Useful for debugging and UI state rendering.
   */
  function getState(): HistoryState {
    return createHistoryState();
  }

  /**
   * Get detailed history statistics
   *
   * Provides insights into history usage and distribution.
   */
  function getStats(): HistoryStats {
    return createHistoryStats();
  }

  /**
   * Get operation at specific index
   *
   * Returns null if index is invalid or out of bounds.
   */
  function getOperationAt(index: number): Operation | null {
    return getOperationAtIndex(index);
  }

  /**
   * Jump to specific index in history
   *
   * Executes multiple undo/redo operations to reach target index.
   * More efficient than calling undo/redo repeatedly.
   */
  async function jumpTo(targetIndex: number): Promise<void> {
    if (!isValidIndex(targetIndex)) {
      log("warn", "[useHistory] Invalid target index", { targetIndex });
      return;
    }

    if (!isIndexInBounds(targetIndex, historyStack.value.length)) {
      log("warn", "[useHistory] Target index out of bounds", {
        targetIndex,
      });
      return;
    }

    if (hasOperationInProgress()) {
      log("warn", "[useHistory] Cannot jump: operation in progress");
      return;
    }

    const current = currentIndex.value;

    if (targetIndex === current) {
      log("debug", "[useHistory] Already at target index", { targetIndex });
      return;
    }

    if (targetIndex < current) {
      const steps = current - targetIndex;
      for (let i = 0; i < steps; i++) {
        await undo();
        if (hasOperationInProgress()) break; // Stop if operation failed
      }
    }
    else {
      const steps = targetIndex - current;
      for (let i = 0; i < steps; i++) {
        await redo();
        if (hasOperationInProgress()) break; // Stop if operation failed
      }
    }

    log("debug", "[useHistory] Jumped to history index", {
      from: current,
      to: currentIndex.value,
    });
  }

  return {
    // Computed state (reactive)
    canUndo,
    canRedo,
    isOperationInProgress,
    stackSize,
    currentPosition,
    lastFailure: readonly(lastFailure) as DeepReadonly<
      Ref<HistoryFailurePayload | null>
    >,

    // Flags (readonly to prevent external mutation)
    isUndoing: readonly(isUndoing) as DeepReadonly<Ref<boolean>>,
    isRedoing: readonly(isRedoing) as DeepReadonly<Ref<boolean>>,

    execute,
    undo,
    redo,
    clear,

    getState,
    getStats,
    getOperationAt,
    jumpTo,
    clearLastFailure,
  };
}
