/**
 * Canvas clipboard and node manipulation helpers (copy/paste/duplicate).
 */
import {
  shallowRef,
  computed,
  readonly,
  type Ref,
  type ComputedRef,
  type DeepReadonly,
} from "vue";
import type { BuilderNode } from "../../../../../lib/types/nodes";
import { BuilderNodeSchema } from "../../../../../lib/schemas/nodes";
import {
  generateNodeId as createNodeId,
  regenerateNodeTreeIds,
} from "../../../../../lib/ids/nodeId";

/**
 * Clipboard entry metadata
 */
interface ClipboardMetadata {
  /** When the node was copied */
  readonly copiedAt: number;
  /** Original node ID before cloning */
  readonly sourceId: string;
  /** Node type for validation */
  readonly nodeType: string;
}

/**
 * Clipboard state with metadata
 */
interface ClipboardState {
  /** The copied node */
  readonly node: BuilderNode;
  /** Copy metadata */
  readonly metadata: ClipboardMetadata;
}

/**
 * Options for cloning operations
 */
interface CloneOptions {
  /** Whether to regenerate IDs (default: true) */
  readonly regenerateIds?: boolean;
  /** Whether to preserve metadata (default: true) */
  readonly preserveMetadata?: boolean;
}

/**
 * Result of a paste operation
 */
interface PasteResult {
  /** Whether paste was successful */
  readonly success: boolean;
  /** The pasted node (if successful) */
  readonly node?: BuilderNode;
  /** Error message (if failed) */
  readonly error?: string;
}

/**
 * Composable return type
 */
interface UseCanvasInteractionsReturn {
  /** Current clipboard state */
  readonly clipboard: DeepReadonly<Ref<ClipboardState | null>>;
  /** Whether clipboard has content */
  readonly hasClipboard: ComputedRef<boolean>;
  /** Whether paste is available */
  readonly canPaste: ComputedRef<boolean>;
  /** Type of node in clipboard */
  readonly clipboardNodeType: ComputedRef<string | null>;
  /** Copy node to clipboard */
  readonly copyNode: (node: BuilderNode) => void;
  /** Paste node from clipboard */
  readonly pasteNode: (options?: CloneOptions) => PasteResult;
  /** Get clipboard node without removing */
  readonly peekClipboard: () => BuilderNode | null;
  /** Clear clipboard */
  readonly clearClipboard: () => void;
  /** Clone node with new IDs */
  readonly cloneNode: (
    node: BuilderNode,
    options?: CloneOptions,
  ) => BuilderNode;
  /** Generate unique node ID */
  readonly generateNodeId: () => string;
}

/**
 * Deep clone a node using JSON serialization
 */
function deepCloneNode(node: BuilderNode): BuilderNode {
  try {
    const clonedValue = JSON.parse(JSON.stringify(node)) as unknown;
    const parsedNode = BuilderNodeSchema.safeParse(clonedValue);
    if (!parsedNode.success) {
      throw new Error("Invalid cloned node structure");
    }

    return parsedNode.data;
  } catch (error) {
    console.error("[useCanvasInteractions] Failed to clone node:", error);
    throw new Error("Failed to clone node: Invalid structure");
  }
}

/**
 * Recursively regenerate IDs for node tree
 */
function regenerateNodeIds(node: BuilderNode): BuilderNode {
  return regenerateNodeTreeIds(node);
}

/**
 * Validate node structure
 */
function isValidNode(node: unknown): node is BuilderNode {
  return BuilderNodeSchema.safeParse(node).success;
}

/**
 * Extract node metadata for clipboard
 */
function createClipboardMetadata(node: BuilderNode): ClipboardMetadata {
  return {
    copiedAt: Date.now(),
    sourceId: node.id,
    nodeType: node.type,
  };
}

/**
 * Create clipboard state entry
 */
function createClipboardState(node: BuilderNode): ClipboardState {
  return {
    node: deepCloneNode(node),
    metadata: createClipboardMetadata(node),
  };
}

/**
 * Clone node from clipboard with options
 */
function cloneFromClipboard(
  state: ClipboardState,
  options: CloneOptions = {},
): BuilderNode {
  const { regenerateIds = true } = options;

  let cloned = deepCloneNode(state.node);

  if (regenerateIds) {
    cloned = regenerateNodeIds(cloned);
  }

  return cloned;
}

/**
 * Clipboard + node helpers for the canvas editor
 *
 * @example
 * ```vue
 * <script setup>
 * const {
 *   clipboard,
 *   canPaste,
 *   copyNode,
 *   pasteNode,
 *   clearClipboard,
 *   cloneNode
 * } = useCanvasInteractions();
 *
 * // Copy selected node
 * function handleCopy(node: BuilderNode) {
 *   copyNode(node);
 *   toast.success('Copied to clipboard');
 * }
 *
 * // Paste with new IDs
 * function handlePaste() {
 *   const result = pasteNode({ regenerateIds: true });
 *   if (result.success && result.node) {
 *     addNodeToCanvas(result.node);
 *   }
 * }
 *
 * // Clone without clipboard
 * function handleDuplicate(node: BuilderNode) {
 *   const cloned = cloneNode(node);
 *   addNodeToCanvas(cloned);
 * }
 * </script>
 * ```
 */
export function useCanvasInteractions(): UseCanvasInteractionsReturn {

  const clipboard = shallowRef<ClipboardState | null>(null);

  /**
   * Whether clipboard has content
   */
  const hasClipboard = computed<boolean>(() => clipboard.value !== null);

  /**
   * Whether paste operation is available
   */
  const canPaste = computed<boolean>(
    () => clipboard.value !== null && isValidNode(clipboard.value.node),
  );

  /**
   * Type of node currently in clipboard
   */
  const clipboardNodeType = computed<string | null>(
    () => clipboard.value?.metadata.nodeType ?? null,
  );

  /**
   * Copy node to clipboard
   *
   * Creates a deep clone of the node and stores it with metadata.
   * Does not modify the original node.
   */
  function copyNode(node: BuilderNode): void {
    if (!isValidNode(node)) {
      console.error("[useCanvasInteractions] Invalid node structure:", node);
      return;
    }

    clipboard.value = createClipboardState(node);

    if (import.meta.env.DEV) {
      console.debug(
        `[useCanvasInteractions] Copied node: ${node.id} (${node.type})`,
      );
    }
  }

  /**
   * Paste node from clipboard with options
   *
   * Returns a new node with regenerated IDs (by default).
   * Does not clear clipboard after paste.
   */
  function pasteNode(options: CloneOptions = {}): PasteResult {
    if (!clipboard.value) {
      return {
        success: false,
        error: "Clipboard is empty",
      };
    }

    if (!isValidNode(clipboard.value.node)) {
      return {
        success: false,
        error: "Invalid node in clipboard",
      };
    }

    try {
      const cloned = cloneFromClipboard(clipboard.value, options);

      if (import.meta.env.DEV) {
        console.debug(
          `[useCanvasInteractions] Pasted node: ${cloned.id} (${cloned.type})`,
        );
      }

      return {
        success: true,
        node: cloned,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[useCanvasInteractions] Paste failed:", error);

      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Get clipboard node without removing it
   *
   * Returns a deep clone to prevent external mutation.
   */
  function peekClipboard(): BuilderNode | null {
    if (!clipboard.value) return null;
    return deepCloneNode(clipboard.value.node);
  }

  /**
   * Clear clipboard contents
   */
  function clearClipboard(): void {
    clipboard.value = null;

    if (import.meta.env.DEV) {
      console.debug("[useCanvasInteractions] Clipboard cleared");
    }
  }

  /**
   * Clone a node with optional ID regeneration
   *
   * Creates a deep copy with new IDs by default.
   * Use this for duplicate operations outside of copy/paste.
   */
  function cloneNode(
    node: BuilderNode,
    options: CloneOptions = {},
  ): BuilderNode {
    if (!isValidNode(node)) {
      throw new Error("Invalid node structure");
    }

    const { regenerateIds = true } = options;

    let cloned = deepCloneNode(node);

    if (regenerateIds) {
      cloned = regenerateNodeIds(cloned);
    }

    if (import.meta.env.DEV) {
      console.debug(
        `[useCanvasInteractions] Cloned node: ${node.id} → ${cloned.id}`,
      );
    }

    return cloned;
  }

  /**
   * Generate unique node ID
   */
  function generateNodeId(): string {
    return createNodeId();
  }

  return {
    // State (readonly to prevent external mutation)
    clipboard: readonly(clipboard) as DeepReadonly<Ref<ClipboardState | null>>,
    hasClipboard,
    canPaste,
    clipboardNodeType,

    // Clipboard operations
    copyNode,
    pasteNode,
    peekClipboard,
    clearClipboard,

    // Node operations
    cloneNode,
    generateNodeId,
  };
}
