import { ref, computed, readonly } from "vue";

interface NodeUpdatePayload {
  nodeId: string;
  /** Property name to update (e.g., "title", "variant") */
  propName: string;
  value: unknown;
  description?: string;
}

interface BatchUpdatePayload {
  nodeId: string;
  /** Map of property names to values */
  updates: Record<string, unknown>;
  description?: string;
}

/**
 * Update callback function signature.
 * Invoked when a node property is updated.
 */
type UpdateCallback = (payload: NodeUpdatePayload) => void;

/**
 * Batch update callback function signature.
 * Invoked when multiple properties are updated at once.
 */
type BatchUpdateCallback = (payload: BatchUpdatePayload) => void;

interface UpdateResult {
  success: boolean;
  /** Error message if update failed */
  error?: string;
}

interface NodeUpdaterOptions {
  debug?: boolean;
  validateNodeId?: boolean;
  /** Validate property names before updates */
  validatePropName?: boolean;
}

/**
 * Update statistics.
 */
interface UpdateStats {
  totalUpdates: number;
  successfulUpdates: number;
  failedUpdates: number;
  lastUpdateTime: number | null;
}

const DEFAULT_OPTIONS: NodeUpdaterOptions = {
  debug: false,
  validateNodeId: true,
  validatePropName: true,
};

/**
 * Reserved property names that should not be updated directly.
 */
const RESERVED_PROPS = new Set([
  "id",
  "type",
  "children",
  "__internal",
  "__meta",
]);

/**
 * Error message templates.
 */
const ERROR_MESSAGES = {
  NO_CALLBACK:
    "No update callback registered. Did you call registerNodeUpdateCallback?",
  INVALID_NODE_ID: "Invalid node ID provided",
  INVALID_PROP_NAME: "Invalid property name provided",
  RESERVED_PROP: (prop: string) => `Cannot update reserved property: ${prop}`,
  EMPTY_UPDATES: "No updates provided for batch operation",
  UPDATE_FAILED: (reason: string) => `Update failed: ${reason}`,
} as const;

// SHARED STATE (Module-level Singleton)

/**
 * Registered update callback.
 * Set by App.vue or parent component.
 */
let updateCallback: UpdateCallback | null = null;

/**
 * Registered batch update callback.
 * Optional, falls back to individual updates if not set.
 */
let batchUpdateCallback: BatchUpdateCallback | null = null;

/**
 * Update statistics tracker.
 */
const stats = ref<UpdateStats>({
  totalUpdates: 0,
  successfulUpdates: 0,
  failedUpdates: 0,
  lastUpdateTime: null,
});

const isCallbackRegistered = ref(false);

/**
 * Validates that a node ID is non-empty and valid.
 *
 * @param nodeId - Node ID to validate
 * @returns True if valid node ID
 */
function isValidNodeId(nodeId: unknown): nodeId is string {
  return typeof nodeId === "string" && nodeId.trim().length > 0;
}

/**
 * Validates that a property name is non-empty and valid.
 *
 * @param propName - Property name to validate
 * @returns True if valid property name
 */
function isValidPropName(propName: unknown): propName is string {
  return typeof propName === "string" && propName.trim().length > 0;
}

/**
 * Validates that a property name is not reserved.
 *
 * @param propName - Property name to check
 * @returns True if property can be updated
 */
function isReservedProp(propName: string): boolean {
  return RESERVED_PROPS.has(propName);
}

/**
 * Validates a node update payload.
 *
 * @param payload - Payload to validate
 * @param options - Validation options
 * @returns True if payload is valid
 */
function validateUpdatePayload(
  payload: NodeUpdatePayload,
  options: NodeUpdaterOptions,
): UpdateResult {
  if (options.validateNodeId && !isValidNodeId(payload.nodeId)) {
    return {
      success: false,
      error: ERROR_MESSAGES.INVALID_NODE_ID,
    };
  }

  if (options.validatePropName && !isValidPropName(payload.propName)) {
    return {
      success: false,
      error: ERROR_MESSAGES.INVALID_PROP_NAME,
    };
  }

  // Check for reserved properties
  if (isReservedProp(payload.propName)) {
    return {
      success: false,
      error: ERROR_MESSAGES.RESERVED_PROP(payload.propName),
    };
  }

  return { success: true };
}

/**
 * Validates batch update payload.
 *
 * @param payload - Payload to validate
 * @param options - Validation options
 * @returns True if payload is valid
 */
function validateBatchPayload(
  payload: BatchUpdatePayload,
  options: NodeUpdaterOptions,
): UpdateResult {
  if (options.validateNodeId && !isValidNodeId(payload.nodeId)) {
    return {
      success: false,
      error: ERROR_MESSAGES.INVALID_NODE_ID,
    };
  }

  // Check for empty updates
  if (!payload.updates || Object.keys(payload.updates).length === 0) {
    return {
      success: false,
      error: ERROR_MESSAGES.EMPTY_UPDATES,
    };
  }

  for (const propName of Object.keys(payload.updates)) {
    if (options.validatePropName && !isValidPropName(propName)) {
      return {
        success: false,
        error: `${ERROR_MESSAGES.INVALID_PROP_NAME}: ${propName}`,
      };
    }

    if (isReservedProp(propName)) {
      return {
        success: false,
        error: ERROR_MESSAGES.RESERVED_PROP(propName),
      };
    }
  }

  return { success: true };
}

/**
 * Registers a callback for single property updates.
 * Should be called by App.vue or parent component.
 *
 * @param callback - Update callback function
 *
 * @example
 * ```ts
 * // In App.vue
 * onMounted(() => {
 *   registerNodeUpdateCallback((payload) => {
 *     updateNodeProperty(payload);
 *   });
 * });
 * ```
 */
export function registerNodeUpdateCallback(callback: UpdateCallback): void {
  updateCallback = callback;
  isCallbackRegistered.value = true;
}

/**
 * Registers a callback for batch property updates.
 * Optional - if not provided, batch updates will fall back to individual updates.
 *
 * @param callback - Batch update callback function
 *
 * @example
 * ```ts
 * // In App.vue
 * onMounted(() => {
 *   registerBatchUpdateCallback((payload) => {
 *     updateMultipleProperties(payload);
 *   });
 * });
 * ```
 */
export function registerBatchUpdateCallback(
  callback: BatchUpdateCallback,
): void {
  batchUpdateCallback = callback;
}

/**
 * Unregisters all callbacks.
 * Should be called in onBeforeUnmount.
 *
 * @example
 * ```ts
 * onBeforeUnmount(() => {
 *   unregisterCallbacks();
 * });
 * ```
 */
export function unregisterCallbacks(): void {
  updateCallback = null;
  batchUpdateCallback = null;
  isCallbackRegistered.value = false;
}

/**
 * Node property update manager for Aria builder.
 *
 * Callbacks for components to update node properties.
 * Used by PropsTab, StylesTab, and other inspector panels.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * // In PropsTab.vue
 * const updater = useNodeUpdater({ debug: true });
 *
 * // Update single property
 * const result = updater.updateNodeProp(
 *   'hero-section',
 *   'title',
 *   'New Title',
 *   'Update hero title'
 * );
 *
 * // Update multiple properties
 * updater.updateNodeProps('hero-section', {
 *   title: 'New Title',
 *   subtitle: 'New Subtitle',
 * });
 * ```
 */
export function useNodeUpdater(options: NodeUpdaterOptions = {}) {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const { debug } = mergedOptions;

  /**
   * Whether update callback is registered and ready.
   */
  const isReady = computed<boolean>(() => {
    return updateCallback !== null;
  });

  /**
   * Whether batch updates are supported.
   */
  const supportsBatchUpdates = computed<boolean>(() => {
    return batchUpdateCallback !== null;
  });

  /**
   * Update success rate (percentage).
   */
  const successRate = computed<number>(() => {
    if (stats.value.totalUpdates === 0) return 100;
    return (stats.value.successfulUpdates / stats.value.totalUpdates) * 100;
  });

  /**
   * Current update statistics.
   */
  const updateStats = computed<UpdateStats>(() => {
    return { ...stats.value };
  });

  /**
   * Updates a single node property.
   *
   * @param nodeId - ID of node to update
   * @param propName - Property name (e.g., "title", "variant")
   * @param value - New property value
   * @param description - Optional description for history/undo
   * @returns Update result with success status
   *
   * @example
   * ```ts
   * const result = updateNodeProp('hero', 'title', 'Hello World');
   * if (!result.success) {
   *   console.error(result.error);
   * }
   * ```
   */
  function updateNodeProp(
    nodeId: string,
    propName: string,
    value: unknown,
    description?: string,
  ): UpdateResult {
    // Check if callback is registered
    if (!updateCallback) {
      console.warn(`[useNodeUpdater] ${ERROR_MESSAGES.NO_CALLBACK}`);
      return {
        success: false,
        error: ERROR_MESSAGES.NO_CALLBACK,
      };
    }

    const payload: NodeUpdatePayload = {
      nodeId,
      propName,
      value,
      description,
    };

    const validation = validateUpdatePayload(payload, mergedOptions);
    if (!validation.success) {
      if (debug) {
        console.warn(`[useNodeUpdater] Validation failed:`, validation.error);
      }
      stats.value.totalUpdates++;
      stats.value.failedUpdates++;
      return validation;
    }

    try {
      updateCallback(payload);

      stats.value.totalUpdates++;
      stats.value.successfulUpdates++;
      stats.value.lastUpdateTime = Date.now();

      if (debug) {
        console.log(`[useNodeUpdater] Updated ${nodeId}.${propName}:`, value);
      }

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      stats.value.totalUpdates++;
      stats.value.failedUpdates++;

      console.error(`[useNodeUpdater] Update failed:`, error);

      return {
        success: false,
        error: ERROR_MESSAGES.UPDATE_FAILED(errorMessage),
      };
    }
  }

  /**
   * Updates multiple properties at once.
   * Uses batch callback if available, otherwise falls back to individual updates.
   *
   * @param nodeId - ID of node to update
   * @param updates - Map of property names to values
   * @param description - Optional description for history/undo
   * @returns Update result with success status
   *
   * @example
   * ```ts
   * const result = updateNodeProps('hero', {
   *   title: 'New Title',
   *   subtitle: 'New Subtitle',
   *   variant: 'primary',
   * }, 'Update hero content');
   * ```
   */
  function updateNodeProps(
    nodeId: string,
    updates: Record<string, unknown>,
    description?: string,
  ): UpdateResult {
    // Check if callback is registered
    if (!updateCallback) {
      console.warn(`[useNodeUpdater] ${ERROR_MESSAGES.NO_CALLBACK}`);
      return {
        success: false,
        error: ERROR_MESSAGES.NO_CALLBACK,
      };
    }

    const payload: BatchUpdatePayload = {
      nodeId,
      updates,
      description,
    };

    const validation = validateBatchPayload(payload, mergedOptions);
    if (!validation.success) {
      if (debug) {
        console.warn(
          `[useNodeUpdater] Batch validation failed:`,
          validation.error,
        );
      }
      stats.value.totalUpdates++;
      stats.value.failedUpdates++;
      return validation;
    }

    try {
      // Use batch callback if available
      if (batchUpdateCallback) {
        batchUpdateCallback(payload);

        if (debug) {
          console.log(
            `[useNodeUpdater] Batch updated ${nodeId}:`,
            Object.keys(updates),
          );
        }
      } else {
        // Fall back to individual updates
        for (const [propName, value] of Object.entries(updates)) {
          updateCallback({
            nodeId,
            propName,
            value,
            description,
          });
        }

        if (debug) {
          console.log(
            `[useNodeUpdater] Individual updates for ${nodeId}:`,
            Object.keys(updates),
          );
        }
      }

      stats.value.totalUpdates++;
      stats.value.successfulUpdates++;
      stats.value.lastUpdateTime = Date.now();

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      stats.value.totalUpdates++;
      stats.value.failedUpdates++;

      console.error(`[useNodeUpdater] Batch update failed:`, error);

      return {
        success: false,
        error: ERROR_MESSAGES.UPDATE_FAILED(errorMessage),
      };
    }
  }

  /**
   * Checks if a property can be updated.
   *
   * @param propName - Property name to check
   * @returns True if property can be updated
   *
   * @example
   * ```ts
   * if (canUpdateProp('id')) {
   *   // This will be false - id is reserved
   * }
   * ```
   */
  function canUpdateProp(propName: string): boolean {
    return !isReservedProp(propName);
  }

  /**
   * Resets update statistics.
   *
   * @example
   * ```ts
   * resetStats(); // Clear all statistics
   * ```
   */
  function resetStats(): void {
    stats.value = {
      totalUpdates: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      lastUpdateTime: null,
    };

    if (debug) {
      console.log("[useNodeUpdater] Statistics reset");
    }
  }

  return {
    // State (readonly to prevent external mutations)
    isCallbackRegistered: readonly(isCallbackRegistered),
    stats: readonly(stats),

    isReady,
    supportsBatchUpdates,
    successRate,
    updateStats,

    updateNodeProp,
    updateNodeProps,

    canUpdateProp,
    resetStats,
  };
}
