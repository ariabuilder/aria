/**
 * Type-safe Astro action wrappers with loading, errors, and toasts.
 */
import { actions } from "astro:actions";
import { ref, computed, readonly, type Ref, type ComputedRef } from "vue";
import { toast } from "vue-sonner";
import type { OperationId } from "../../lib/auth/capabilityOperations";
import type { BuilderNode } from "../../lib/types/nodes";
import { decodeRenderActionErrorMessage } from "../../lib/rendering/actionErrorMessage";
import { getForbiddenMessageForOperation } from "./useCapabilities";

/**
 * Resource collection types
 */
type Collection = "pages" | "layouts" | "components";

/**
 * Item types for compose action
 */
type ItemType = "page" | "layout" | "component";

type NodeMutateParams = {
  collection: Collection;
  id: string;
  nodeId: string;
  updates: {
    styles?: Record<string, Record<string, unknown>>;
    props?: Record<string, unknown>;
    a11y?: Partial<NonNullable<BuilderNode["a11y"]>>;
  };
  breakpoint: string;
  version?: string;
};

/**
 * Generic action result from Astro actions
 */
interface ActionResult<T = unknown> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Action execution options
 */
interface ActionOptions {
  /** Success message to show in toast */
  successMessage?: string;
  /** Suppress error toast (for silent failures) */
  silentErrors?: boolean;
  /** Suppress success toast */
  silentSuccess?: boolean;
  /** Maps FORBIDDEN responses to user-facing capability copy */
  forbiddenOperationId?: OperationId;
  /** Custom error handler */
  onError?: (error: Error) => void;
  /** Custom success handler */
  onSuccess?: (data: unknown) => void;
}

/**
 * Composable return type
 */
interface UseActionsReturn {
  // State
  readonly loading: Ref<boolean>;
  readonly error: Ref<string | null>;
  readonly isIdle: ComputedRef<boolean>;

  // Core CRUD
  readonly init: () => Promise<unknown>;
  readonly getItem: (collection: Collection, slug: string) => Promise<unknown>;
  readonly createItem: <T = unknown>(
    collection: Collection,
    slug: string,
    data: T,
  ) => Promise<unknown>;
  readonly updateItem: <T = unknown>(
    collection: Collection,
    slug: string,
    data: T,
  ) => Promise<unknown>;
  readonly deleteItem: (
    collection: Collection,
    slug: string,
  ) => Promise<boolean>;
  readonly duplicateItem: (
    collection: Collection,
    sourceSlug: string,
    newSlug: string,
  ) => Promise<unknown>;

  // Node operations
  readonly mutate: (params: NodeMutateParams) => Promise<unknown>;
  readonly insertNode: (params: {
    itemId: string;
    itemType: ItemType;
    node: BuilderNode;
    parentId?: string;
    position?: number;
  }) => Promise<unknown>;
  readonly deleteNode: (params: {
    itemId: string;
    itemType: ItemType;
    nodeId: string;
  }) => Promise<unknown>;
  readonly moveNode: (params: {
    itemId: string;
    itemType: ItemType;
    nodeId: string;
    targetParentId?: string;
    targetIndex?: number;
  }) => Promise<unknown>;

  // Bulk operations
  readonly savePage: (
    id: string,
    blocks: readonly BuilderNode[],
    expectedVersion: string,
    layout?: string,
    nonce?: string,
  ) => Promise<unknown>;
  readonly saveLayout: (
    id: string,
    blocks: readonly BuilderNode[],
    expectedVersion: string,
  ) => Promise<unknown>;
  readonly saveComponent: (
    id: string,
    blocks: readonly BuilderNode[],
    expectedVersion: string,
  ) => Promise<unknown>;

  // Server-side composition
  readonly compose: (pageSlug: string, itemType?: ItemType) => Promise<unknown>;

  // Utilities
  readonly clearError: () => void;
}

/**
 * Converts collection name to singular form for user-facing messages
 */
function singularize(collection: Collection): string {
  const map: Record<Collection, string> = {
    pages: "Page",
    layouts: "Layout",
    components: "Component",
  };
  return map[collection];
}

function itemTypeToCollection(itemType: ItemType): Collection {
  switch (itemType) {
    case "page":
      return "pages";
    case "layout":
      return "layouts";
    case "component":
      return "components";
  }
}

/**
 * Extracts error message from various error types
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "An unexpected error occurred";
}

/**
 * Creates a standardized error object
 */
function createError(message: string, code = "ACTION_ERROR"): Error {
  const error = new Error(message);
  error.name = code;
  return error;
}

/**
 * Astro server actions with loading/error state
 *
 * @example
 * ```vue
 * <script setup>
 * const { loading, error, savePage, clearError } = useActions();
 *
 * async function handleSave() {
 *   const result = await savePage(pageId, blocks);
 *   if (result) {
 *     // Success
 *   }
 * }
 * </script>
 * ```
 */
export function useActions(): UseActionsReturn {
  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);

  const isIdle = computed<boolean>(() => !loading.value && !error.value);

  /**
   * Generic action executor with standardized error handling and loading state
   */
  async function executeAction<TData>(
    actionFn: () => Promise<ActionResult<TData>>,
    options: ActionOptions = {},
  ): Promise<TData | null> {
    loading.value = true;
    error.value = null;

    try {
      const result = await actionFn();

      // Handle action-level errors
      if (result.error) {
        const renderError = decodeRenderActionErrorMessage(
          result.error.message,
        );
        const errorMessage =
          result.error.code === "FORBIDDEN" && options.forbiddenOperationId
            ? getForbiddenMessageForOperation(options.forbiddenOperationId)
            : renderError?.message || result.error.message || "Action failed";
        throw createError(errorMessage, renderError?.code ?? result.error.code);
      }

      // Handle success
      const data = result.data ?? null;

      if (options.onSuccess) {
        options.onSuccess(data);
      }

      if (options.successMessage && !options.silentSuccess) {
        toast.success(options.successMessage);
      }

      return data as TData | null;
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
      error.value = errorMessage;

      if (options.onError) {
        options.onError(err as Error);
      }

      if (!options.silentErrors) {
        toast.error(errorMessage);
      }

      console.error("[useActions] Action failed:", {
        error: err,
        message: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
      });

      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Initialize builder data (loads all pages, layouts, components)
   */
  async function init() {
    return executeAction(() => actions.init(), {
      successMessage: "Builder initialized",
    });
  }

  /**
   * Fetch a single item by collection and slug
   */
  async function getItem(collection: Collection, slug: string) {
    return executeAction(() => actions.getItem({ collection, slug }), {
      silentSuccess: true,
    });
  }

  /**
   * Create a new item in the specified collection
   */
  async function createItem<T>(collection: Collection, slug: string, data: T) {
    return executeAction(() => actions.createItem({ collection, slug, data }), {
      successMessage: `${singularize(collection)} created successfully`,
    });
  }

  /**
   * Update an existing item
   */
  async function updateItem<T>(collection: Collection, slug: string, data: T) {
    return executeAction(() => actions.updateItem({ collection, slug, data }), {
      successMessage: `${singularize(collection)} updated successfully`,
    });
  }

  /**
   * Delete an item from the collection
   */
  async function deleteItem(collection: Collection, slug: string) {
    const result = await executeAction(
      () => actions.deleteItem({ collection, slug }),
      { successMessage: `${singularize(collection)} deleted successfully` },
    );
    return result !== null;
  }

  /**
   * Duplicate an existing item with a new slug
   */
  async function duplicateItem(
    collection: Collection,
    sourceSlug: string,
    newSlug: string,
  ) {
    return executeAction(
      () => actions.duplicateItem({ collection, sourceSlug, newSlug }),
      { successMessage: `${singularize(collection)} duplicated successfully` },
    );
  }

  /**
   * Update a single node property (granular mutation)
   */
  async function mutate(params: NodeMutateParams) {
    return executeAction(() => actions.mutate(params), { silentSuccess: true });
  }

  /**
   * Insert a new node into the tree
   */
  async function insertNode(params: {
    itemId: string;
    itemType: ItemType;
    node: BuilderNode;
    parentId?: string;
    position?: number;
  }) {
    return executeAction(
      () =>
        actions.insertNode({
          collection: itemTypeToCollection(params.itemType),
          id: params.itemId,
          parentId: params.parentId ?? null,
          node: params.node,
          position: params.position,
        }),
      {
        successMessage: "Element added",
      },
    );
  }

  /**
   * Delete a node from the tree
   */
  async function deleteNode(params: {
    itemId: string;
    itemType: ItemType;
    nodeId: string;
  }) {
    return executeAction(
      () =>
        actions.deleteNode({
          collection: itemTypeToCollection(params.itemType),
          id: params.itemId,
          nodeId: params.nodeId,
        }),
      {
        successMessage: "Element deleted",
      },
    );
  }

  /**
   * Move a node to a new position in the tree
   */
  async function moveNode(params: {
    itemId: string;
    itemType: ItemType;
    nodeId: string;
    targetParentId?: string;
    targetIndex?: number;
  }) {
    return executeAction(
      () =>
        actions.moveNode({
          collection: itemTypeToCollection(params.itemType),
          id: params.itemId,
          nodeId: params.nodeId,
          targetParentId: params.targetParentId ?? null,
          position: params.targetIndex,
        }),
      {
        silentSuccess: true,
      },
    );
  }

  /**
   * Save entire page with all blocks
   */
  async function savePage(
    id: string,
    blocks: readonly BuilderNode[],
    expectedVersion: string,
    layout?: string,
    nonce?: string,
  ) {
    return executeAction(
      () =>
        actions.savePage({
          id,
          blocks: [...blocks],
          expectedVersion,
          layout,
          nonce,
        }),
      { successMessage: "Page saved successfully" },
    );
  }

  /**
   * Save layout with all blocks
   */
  async function saveLayout(
    id: string,
    blocks: readonly BuilderNode[],
    expectedVersion: string,
  ) {
    return executeAction(
      () => actions.saveLayout({ id, blocks: [...blocks], expectedVersion }),
      {
        successMessage: "Layout saved successfully",
      },
    );
  }

  /**
   * Save component with all blocks
   */
  async function saveComponent(
    id: string,
    blocks: readonly BuilderNode[],
    expectedVersion: string,
  ) {
    return executeAction(
      () => actions.saveComponent({ id, blocks: [...blocks], expectedVersion }),
      {
        successMessage: "Component saved successfully",
      },
    );
  }

  /**
   * Load page/layout with server-side component expansion
   *
   * Returns fully expanded blocks ready to render (components inlined)
   */
  async function compose(pageSlug: string, itemType: ItemType = "page") {
    return executeAction(() => actions.compose({ pageSlug, itemType }), {
      silentSuccess: true,
    });
  }

  /**
   * Clear error state manually
   */
  function clearError(): void {
    error.value = null;
  }

  return {
    // State (readonly to prevent external mutation)
    loading: readonly(loading) as Ref<boolean>,
    error: readonly(error) as Ref<string | null>,
    isIdle,

    init,
    getItem,
    createItem,
    updateItem,
    deleteItem,
    duplicateItem,

    // Node operations
    mutate,
    insertNode,
    deleteNode,
    moveNode,

    // Bulk saves
    savePage,
    saveLayout,
    saveComponent,

    // Composition
    compose,

    // Utilities
    clearError,
  };
}
