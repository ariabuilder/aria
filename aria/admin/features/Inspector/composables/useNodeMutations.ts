/**
 * ALL node mutations in the Inspector go through this composable. Type-safe wrappers
 * around Astro Actions with: - Zod validation before sending - Optimistic UI.
 */

import { ref, readonly, computed } from "vue";
import { z } from "zod";
import { useSelectedNodeState } from "../../Core/composables/useSelectedNodeState";
import type { NodeTarget, UpdateResult } from "../types/inspector";
import {
  NodeDataSourceSchema,
  StyleMapSchema,
} from "../../../../lib/schemas/nodes";
import type {
  BuilderNode,
  JsonValue,
  StyleMap,
} from "../../../../lib/types/nodes";
import { getSchemaRegistry } from "../schemas/registry";
import type { PropertySchemaKey } from "../types/schema";
import {
  NodeMutationUpdatesSchema,
  useNodeMutationHistory,
  type NodeMutationUpdates,
} from "./useNodeMutationHistory";

type MutationOperation = "property" | "style" | "batch" | "className";

interface MutationHistoryEntry {
  operation: MutationOperation;
  target: NodeTarget;
  timestamp: number;
  success: boolean;
  description?: string;
}

// STATE (Module-level)

const isUpdating = ref(false);

const lastError = ref<string | null>(null);

const lastErrorCode = ref<string | null>(null);

const mutationHistory = ref<MutationHistoryEntry[]>([]);

const MAX_HISTORY = 50;

const NodePathSchema = z.object({
  collection: z.enum(["pages", "layouts", "components"]),
  id: z.string().min(1),
  version: z.string().optional(),
});

const NodeTargetSchema = z.object({
  path: NodePathSchema,
  nodeId: z.string().min(1),
});

const PropertyMutationSchema = z.object({
  target: NodeTargetSchema,
  update: z.object({
    path: z.string().min(1),
    value: z.unknown(),
    breakpoint: z.string().optional(),
  }),
});

const StyleMutationSchema = z.object({
  target: NodeTargetSchema,
  update: z.object({
    styles: z.record(z.string(), z.unknown()),
    breakpoint: z.string().optional(),
  }),
});

const ClassNameMutationSchema = z.object({
  target: NodeTargetSchema,
  className: z.string(),
});

const BatchMutationSchema = z.object({
  target: NodeTargetSchema,
  updates: z
    .record(z.string().min(1), z.unknown())
    .refine((value) => Object.keys(value).length > 0, {
      message: "Batch update cannot be empty",
    }),
  options: z
    .object({
      breakpoint: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
});

/**
 * Build type-safe mutation updates from an Inspector property
 * path. Node-level paths like `dataSource` must stay node-level.
 */
export function buildNodeMutationUpdatesFromPath(
  propertyPath: string,
  value: unknown,
): NodeMutationUpdates | null {
  const parts = propertyPath.split(".");

  if (propertyPath === "dataSource") {
    if (value === undefined) {
      return { dataSource: null };
    }

    const parsedDataSource = z
      .union([NodeDataSourceSchema.unwrap(), z.null()])
      .safeParse(value);
    if (!parsedDataSource.success) {
      return null;
    }
    const parsedUpdates = NodeMutationUpdatesSchema.safeParse({
      dataSource: parsedDataSource.data,
    });
    return parsedUpdates.success ? parsedUpdates.data : null;
  }

  if (propertyPath === "metadata") {
    const parsedUpdates = NodeMutationUpdatesSchema.safeParse({
      metadata: value,
    });
    return parsedUpdates.success ? parsedUpdates.data : null;
  }

  if (parts.length === 1) {
    const parsedUpdates = NodeMutationUpdatesSchema.safeParse({
      props: { [parts[0]]: value },
    });
    return parsedUpdates.success ? parsedUpdates.data : null;
  }

  const [root, ...rest] = parts;
  const nestedPath = rest.join(".");

  if (root === "props") {
    const parsedUpdates = NodeMutationUpdatesSchema.safeParse({
      props: { [nestedPath]: value },
    });
    return parsedUpdates.success ? parsedUpdates.data : null;
  }

  if (root === "styles") {
    const normalizedValue =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : { default: value };

    const parsedUpdates = NodeMutationUpdatesSchema.safeParse({
      styles: { [nestedPath]: normalizedValue },
    });
    return parsedUpdates.success ? parsedUpdates.data : null;
  }

  const parsedUpdates = NodeMutationUpdatesSchema.safeParse({
    props: {
      [propertyPath]: value,
    },
  });

  return parsedUpdates.success ? parsedUpdates.data : null;
}

/**
 * useNodeMutations - Type-safe node mutations
 *
 * @example
 * ```typescript
 * const { updateProperty, updateStyle, isUpdating, lastError } = useNodeMutations();
 *
 * // Update a single property
 * const result = await updateProperty(
 *   { path: nodePath, nodeId },
 *   { path: 'props.title', value: 'New Title' }
 * );
 *
 * // Update styles
 * await updateStyle(
 *   { path: nodePath, nodeId },
 *   { styles: { padding: { default: '1rem' } } }
 * );
 * ```
 */
export function useNodeMutations() {
  const schemaRegistry = getSchemaRegistry();
  const {
    resolveNode,
    selectedNode,
    updateSelectedNodeA11y,
    updateSelectedNodeDataSource,
    updateSelectedNodeMetadata,
    updateSelectedNodeProps,
    updateSelectedNodeStyles,
  } = useSelectedNodeState();
  const { executeNodeMutation } = useNodeMutationHistory();

  /**
   * Clear error state
   */
  function clearError(): void {
    lastError.value = null;
    lastErrorCode.value = null;
  }

  /**
   * Set error state
   */
  function setError(message: string, code?: string): void {
    lastError.value = message;
    lastErrorCode.value = code ?? null;
  }

  /**
   * Add to mutation history
   */
  function addToHistory(entry: Omit<MutationHistoryEntry, "timestamp">): void {
    mutationHistory.value.unshift({
      ...entry,
      timestamp: Date.now(),
    });

    if (mutationHistory.value.length > MAX_HISTORY) {
      mutationHistory.value = mutationHistory.value.slice(0, MAX_HISTORY);
    }
  }

  /**
   * Build nested object from path parts
   */
  function toStyleUpdates(styles: Partial<StyleMap>): Partial<StyleMap> | null {
    const parsedStyles = StyleMapSchema.safeParse(styles);
    return parsedStyles.success ? (parsedStyles.data ?? {}) : null;
  }

  function toMutationStyleUpdates(
    styles: Partial<StyleMap>,
  ): NodeMutationUpdates["styles"] | null {
    const normalizedStyles = toStyleUpdates(styles);
    if (!normalizedStyles) {
      return null;
    }

    const parsedUpdates = NodeMutationUpdatesSchema.safeParse({
      styles: normalizedStyles,
    });

    return parsedUpdates.success ? parsedUpdates.data.styles : null;
  }

  function getValueAtPath(node: BuilderNode | null, path: string): unknown {
    if (!node) return undefined;

    const parts = path.split(".");
    let current: unknown = node;

    for (const part of parts) {
      if (current == null || typeof current !== "object") {
        return undefined;
      }

      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  function getTargetNode(target: NodeTarget): BuilderNode | null {
    return resolveNode(target.nodeId) ?? selectedNode.value;
  }

  function applySelectedNodeUpdates(
    nodeId: string,
    updates: NodeMutationUpdates,
  ): void {
    if (updates.props) {
      updateSelectedNodeProps(nodeId, updates.props as Partial<BuilderNode["props"]>);
    }
    if (updates.styles) {
      updateSelectedNodeStyles(nodeId, updates.styles);
    }
    if (updates.a11y) {
      updateSelectedNodeA11y(nodeId, updates.a11y);
    }
    if (updates.dataSource !== undefined) {
      updateSelectedNodeDataSource(nodeId, updates.dataSource);
    }
    if (Object.prototype.hasOwnProperty.call(updates, "metadata")) {
      updateSelectedNodeMetadata(nodeId, updates.metadata);
    }
  }

  /**
   * Update a single property on a node
   */
  async function updateProperty<T extends JsonValue | undefined>(
    target: NodeTarget,
    update: {
      path: string;
      value: T;
      breakpoint?: string;
    },
    options?: {
      description?: string;
      validate?: boolean;
      schemaKey?: string;
      /** State to restore when a caller has already applied an optimistic update. */
      restoreValue?: unknown;
    },
  ): Promise<UpdateResult> {
    clearError();
    isUpdating.value = true;

    try {
      const validationInput = PropertyMutationSchema.safeParse({
        target,
        update,
      });
      if (!validationInput.success) {
        const message =
          validationInput.error.issues[0]?.message ??
          "Invalid property mutation";
        setError(message, "VALIDATION_ERROR");
        return {
          success: false,
          error: message,
          errorCode: "VALIDATION_ERROR",
        };
      }

      if (options?.validate && options?.schemaKey) {
        const validation = schemaRegistry.validate(
          options.schemaKey as PropertySchemaKey,
          update.value,
        );
        if (!validation.success) {
          const errorMsg =
            validation.errors?.map((e) => e.message).join(", ") ??
            "Validation failed";
          setError(errorMsg, "VALIDATION_ERROR");
          return {
            success: false,
            error: errorMsg,
            errorCode: "VALIDATION_ERROR",
          };
        }
      }

      const updates = buildNodeMutationUpdatesFromPath(
        update.path,
        update.value,
      );
      if (!updates) {
        setError("Invalid property update payload", "VALIDATION_ERROR");
        return {
          success: false,
          error: "Invalid property update payload",
          errorCode: "VALIDATION_ERROR",
        };
      }

      const previousValue =
        options && Object.prototype.hasOwnProperty.call(options, "restoreValue")
          ? options.restoreValue
          : getValueAtPath(getTargetNode(target), update.path);
      const restoreUpdates = buildNodeMutationUpdatesFromPath(
        update.path,
        previousValue,
      );
      if (!restoreUpdates) {
        setError("Invalid property restore payload", "VALIDATION_ERROR");
        return {
          success: false,
          error: "Invalid property restore payload",
          errorCode: "VALIDATION_ERROR",
        };
      }

      const mutationBreakpoint = update.breakpoint ?? "default";
      const executeResult = await executeNodeMutation({
        metadata: {
          type: "update-node-props",
          description: options?.description ?? `Update ${update.path}`,
          affectedNodeIds: [target.nodeId],
        },
        target,
        updates,
        restoreUpdates,
        breakpoint: mutationBreakpoint,
        callbacks: {
          onUndo: () =>
            applySelectedNodeUpdates(target.nodeId, restoreUpdates),
          onRedo: () => applySelectedNodeUpdates(target.nodeId, updates),
        },
      });

      if (!executeResult.success) {
        const message = executeResult.error ?? "Update failed";
        setError(message, "UNKNOWN_ERROR");
        addToHistory({
          operation: "property",
          target,
          success: false,
          description: options?.description,
        });
        return { success: false, error: message, errorCode: "UNKNOWN_ERROR" };
      }

      addToHistory({
        operation: "property",
        target,
        success: true,
        description: options?.description,
      });
      return {
        success: true,
        version: executeResult.version,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed";
      setError(message, "UNKNOWN_ERROR");
      addToHistory({
        operation: "property",
        target,
        success: false,
        description: options?.description,
      });
      return { success: false, error: message, errorCode: "UNKNOWN_ERROR" };
    } finally {
      isUpdating.value = false;
    }
  }

  /**
   * Update styles on a node
   */
  async function updateStyle(
    target: NodeTarget,
    update: {
      styles: Partial<StyleMap>;
      breakpoint?: string;
    },
    options?: {
      description?: string;
    },
  ): Promise<UpdateResult> {
    clearError();
    isUpdating.value = true;

    try {
      const validationInput = StyleMutationSchema.safeParse({ target, update });
      if (!validationInput.success) {
        const message =
          validationInput.error.issues[0]?.message ?? "Invalid style mutation";
        setError(message, "VALIDATION_ERROR");
        return {
          success: false,
          error: message,
          errorCode: "VALIDATION_ERROR",
        };
      }

      const styleKeys = Object.keys(update.styles ?? {});
      const targetNode = getTargetNode(target);
      const previousStyles = Object.fromEntries(
        styleKeys.map((key) => [
          key,
          targetNode?.styles?.[key as keyof StyleMap],
        ]),
      ) as Partial<StyleMap>;
      const styleUpdates = toMutationStyleUpdates(update.styles);
      const restoreStyleUpdates = toMutationStyleUpdates(previousStyles);
      if (!styleUpdates || !restoreStyleUpdates) {
        setError("Invalid style update payload", "VALIDATION_ERROR");
        return {
          success: false,
          error: "Invalid style update payload",
          errorCode: "VALIDATION_ERROR",
        };
      }

      const mutationBreakpoint = update.breakpoint ?? "default";
      const executeResult = await executeNodeMutation({
        metadata: {
          type: "update-node-styles",
          description: options?.description ?? "Update node styles",
          affectedNodeIds: [target.nodeId],
        },
        target,
        updates: { styles: styleUpdates },
        restoreUpdates: { styles: restoreStyleUpdates },
        breakpoint: mutationBreakpoint,
        callbacks: {
          onUndo: () =>
            applySelectedNodeUpdates(target.nodeId, {
              styles: restoreStyleUpdates,
            }),
          onRedo: () =>
            applySelectedNodeUpdates(target.nodeId, { styles: styleUpdates }),
        },
      });

      if (!executeResult.success) {
        const message = executeResult.error ?? "Style update failed";
        setError(message, "UNKNOWN_ERROR");
        addToHistory({
          operation: "style",
          target,
          success: false,
          description: options?.description,
        });
        return { success: false, error: message, errorCode: "UNKNOWN_ERROR" };
      }

      addToHistory({
        operation: "style",
        target,
        success: true,
        description: options?.description,
      });
      return {
        success: true,
        version: executeResult.version,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Style update failed";
      setError(message, "UNKNOWN_ERROR");
      addToHistory({
        operation: "style",
        target,
        success: false,
        description: options?.description,
      });
      return { success: false, error: message, errorCode: "UNKNOWN_ERROR" };
    } finally {
      isUpdating.value = false;
    }
  }

  /**
   * Update className on a node
   */
  async function updateClassName(
    target: NodeTarget,
    className: string,
    options?: {
      description?: string;
    },
  ): Promise<UpdateResult> {
    clearError();
    isUpdating.value = true;

    try {
      const validationInput = ClassNameMutationSchema.safeParse({
        target,
        className,
      });
      if (!validationInput.success) {
        const message =
          validationInput.error.issues[0]?.message ??
          "Invalid className mutation";
        setError(message, "VALIDATION_ERROR");
        return {
          success: false,
          error: message,
          errorCode: "VALIDATION_ERROR",
        };
      }

      const previousClassName = getTargetNode(target)?.props?.className;
      const executeResult = await executeNodeMutation({
        metadata: {
          type: "update-node-props",
          description: options?.description ?? "Update className",
          affectedNodeIds: [target.nodeId],
        },
        target,
        updates: { props: { className } },
        restoreUpdates: { props: { className: previousClassName } },
        breakpoint: "default",
        callbacks: {
          onUndo: () =>
            applySelectedNodeUpdates(target.nodeId, {
              props: { className: previousClassName },
            }),
          onRedo: () =>
            applySelectedNodeUpdates(target.nodeId, { props: { className } }),
        },
      });

      if (!executeResult.success) {
        const message = executeResult.error ?? "ClassName update failed";
        setError(message, "UNKNOWN_ERROR");
        addToHistory({
          operation: "className",
          target,
          success: false,
          description: options?.description,
        });
        return { success: false, error: message, errorCode: "UNKNOWN_ERROR" };
      }

      addToHistory({
        operation: "className",
        target,
        success: true,
        description: options?.description,
      });
      return {
        success: true,
        version: executeResult.version,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "ClassName update failed";
      setError(message, "UNKNOWN_ERROR");
      addToHistory({
        operation: "className",
        target,
        success: false,
        description: options?.description,
      });
      return { success: false, error: message, errorCode: "UNKNOWN_ERROR" };
    } finally {
      isUpdating.value = false;
    }
  }

  /**
   * Update multiple properties at once
   */
  async function batchUpdate(
    target: NodeTarget,
    updates: Record<string, unknown>,
    options?: {
      breakpoint?: string;
      description?: string;
    },
  ): Promise<UpdateResult> {
    clearError();
    isUpdating.value = true;

    try {
      const validationInput = BatchMutationSchema.safeParse({
        target,
        updates,
        options,
      });
      if (!validationInput.success) {
        const message =
          validationInput.error.issues[0]?.message ?? "Invalid batch mutation";
        setError(message, "VALIDATION_ERROR");
        return {
          success: false,
          error: message,
          errorCode: "VALIDATION_ERROR",
        };
      }

      // Merge all updates into a single object
      let mergedUpdates: NodeMutationUpdates = {};

      for (const [path, value] of Object.entries(updates)) {
        const pathUpdates = buildNodeMutationUpdatesFromPath(path, value);
        if (!pathUpdates) {
          setError("Invalid batch update payload", "VALIDATION_ERROR");
          return {
            success: false,
            error: "Invalid batch update payload",
            errorCode: "VALIDATION_ERROR",
          };
        }

        mergedUpdates = deepMerge(mergedUpdates, pathUpdates);
      }

      const restoreUpdates = Object.fromEntries(
        Object.keys(updates).map((path) => [
          path,
          getValueAtPath(getTargetNode(target), path),
        ]),
      );
      let mergedRestoreUpdates: NodeMutationUpdates = {};
      for (const [path, value] of Object.entries(restoreUpdates)) {
        const pathUpdates = buildNodeMutationUpdatesFromPath(path, value);
        if (!pathUpdates) {
          setError("Invalid batch restore payload", "VALIDATION_ERROR");
          return {
            success: false,
            error: "Invalid batch restore payload",
            errorCode: "VALIDATION_ERROR",
          };
        }

        mergedRestoreUpdates = deepMerge(mergedRestoreUpdates, pathUpdates);
      }
      const mutationBreakpoint = options?.breakpoint ?? "default";
      const executeResult = await executeNodeMutation({
        metadata: {
          type: "batch-nodes",
          description: options?.description ?? "Batch update node",
          affectedNodeIds: [target.nodeId],
        },
        target,
        updates: mergedUpdates,
        restoreUpdates: mergedRestoreUpdates,
        breakpoint: mutationBreakpoint,
        callbacks: {
          onUndo: () =>
            applySelectedNodeUpdates(target.nodeId, mergedRestoreUpdates),
          onRedo: () => applySelectedNodeUpdates(target.nodeId, mergedUpdates),
        },
      });

      if (!executeResult.success) {
        const message = executeResult.error ?? "Batch update failed";
        setError(message, "UNKNOWN_ERROR");
        addToHistory({
          operation: "batch",
          target,
          success: false,
          description: options?.description,
        });
        return { success: false, error: message, errorCode: "UNKNOWN_ERROR" };
      }

      addToHistory({
        operation: "batch",
        target,
        success: true,
        description: options?.description,
      });
      return {
        success: true,
        version: executeResult.version,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Batch update failed";
      setError(message, "UNKNOWN_ERROR");
      addToHistory({
        operation: "batch",
        target,
        success: false,
        description: options?.description,
      });
      return { success: false, error: message, errorCode: "UNKNOWN_ERROR" };
    } finally {
      isUpdating.value = false;
    }
  }

  /**
   * Whether there's a pending error
   */
  const hasError = computed(() => lastError.value !== null);

  /**
   * Recent successful mutations count
   */
  const recentSuccessCount = computed(() => {
    const oneMinuteAgo = Date.now() - 60000;
    return mutationHistory.value.filter(
      (h) => h.success && h.timestamp > oneMinuteAgo,
    ).length;
  });

  return {
    // State (readonly)
    isUpdating: readonly(isUpdating),
    lastError: readonly(lastError),
    lastErrorCode: readonly(lastErrorCode),
    mutationHistory: readonly(mutationHistory),

    hasError,
    recentSuccessCount,

    updateProperty,
    updateStyle,
    updateClassName,
    batchUpdate,
    clearError,
  };
}

function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): T {
  const output: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key as keyof T];
    const targetValue = target[key as keyof T];

    if (
      sourceValue !== null &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      output[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Partial<Record<string, unknown>>,
      );
    } else {
      output[key] = sourceValue;
    }
  }

  return output as T;
}
