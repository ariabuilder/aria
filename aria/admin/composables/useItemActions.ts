/**
 * List CRUD for pages/layouts/components (rename, delete, duplicate).
 */
import {
  nextTick,
  ref,
  computed,
  readonly,
  type Ref,
  type ComputedRef,
  type DeepReadonly,
} from "vue";

/**
 * Base item type (must be an object)
 */
type ItemRecord = Record<string, unknown>;

/**
 * Configuration options for item actions
 */
interface UseItemActionsOptions {
  /** Key for item ID field (default: 'id') */
  readonly idKey?: string;
  /** Key for item title field (default: 'title') */
  readonly titleKey?: string;
  /** Key for item slug field (default: 'slug') */
  readonly slugKey?: string;
  /** Custom confirmation function (default: window.confirm) */
  readonly confirmFn?: (message: string) => boolean | Promise<boolean>;
  /** Custom delete confirmation message */
  readonly deleteMessage?: string;
  /** Copy suffix pattern (default: 'copy') */
  readonly copySuffix?: string;
  /** Whether to update timestamps on duplicate */
  readonly updateTimestamps?: boolean;
}

/**
 * Delete operation result
 */
interface DeleteResult {
  readonly success: boolean;
  readonly itemId: string | null;
  readonly index: number;
}

/**
 * Duplicate operation result
 */
interface DuplicateResult<T> {
  readonly success: boolean;
  readonly original: T;
  readonly duplicate: T | null;
}

/**
 * Composable return type
 */
interface UseItemActionsReturn<T extends ItemRecord> {
  /** Currently editing item ID */
  readonly editingId: DeepReadonly<Ref<string | null>>;
  readonly isEditing: ComputedRef<boolean>;
  /** Check if specific item is being edited */
  readonly isEditingItem: (item: T) => boolean;
  /** Start rename operation */
  readonly startRename: (item: T) => Promise<void>;
  /** Finish rename operation */
  readonly finishRename: () => void;
  /** Cancel rename operation */
  readonly cancelRename: () => void;
  /** Delete item by ID */
  readonly deleteItem: (id: string) => Promise<DeleteResult>;
  /** Duplicate item */
  readonly duplicateItem: (item: T) => DuplicateResult<T>;
  /** Get item by ID */
  readonly getItemById: (id: string) => T | undefined;
  /** Find item index */
  readonly findItemIndex: (id: string) => number;
}

/** Default ID key */
const DEFAULT_ID_KEY = "id" as const;

/** Default title key */
const DEFAULT_TITLE_KEY = "title" as const;

/** Default slug key */
const DEFAULT_SLUG_KEY = "slug" as const;

/** Default copy suffix */
const DEFAULT_COPY_SUFFIX = "copy" as const;

/** Default delete message */
const DEFAULT_DELETE_MESSAGE = "Delete this item?" as const;

/** Timestamp fields to update */
const TIMESTAMP_FIELDS = ["updated_at", "updatedAt", "lastModified"] as const;

/**
 * Validate item ID
 */
function isValidId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0;
}

/**
 * Validate HTML input element
 */
function isValidInputElement(element: unknown): element is HTMLInputElement {
  return element instanceof HTMLInputElement;
}

/**
 * Check if item has key
 */
function hasKey<T extends ItemRecord>(
  item: T,
  key: string,
): key is Extract<keyof T, string> {
  return key in item;
}

/**
 * Check if value is string
 */
function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Extract input element from ref (handles single or array refs)
 */
function extractInputElement(
  inputRef: Ref<HTMLInputElement | null> | Ref<unknown> | undefined,
): HTMLInputElement | null {
  if (!inputRef) return null;

  const raw = inputRef.value;
  if (!raw) return null;

  // Handle array refs (Vue's ref on v-for)
  if (Array.isArray(raw)) {
    const firstElement = raw[0];
    return isValidInputElement(firstElement) ? firstElement : null;
  }

  // Handle direct element ref
  return isValidInputElement(raw) ? raw : null;
}

/**
 * Focus input and move cursor to end
 */
function focusInputAtEnd(element: HTMLInputElement): void {
  try {
    element.focus();

    // Move cursor to end of input
    const valueLength = element.value.length;
    element.setSelectionRange(valueLength, valueLength);

    if (import.meta.env.DEV) {
      console.debug("[useItemActions] Input focused with cursor at end");
    }
  } catch (error) {
    // setSelectionRange might not be supported on some input types
    console.warn("[useItemActions] Failed to set selection range:", error);
  }
}

/**
 * Get item value by key safely
 */
function getItemValue<T extends ItemRecord>(item: T, key: string): unknown {
  return hasKey(item, key) ? item[key] : undefined;
}

/**
 * Find item index by ID
 */
function findItemIndexById<T extends ItemRecord>(
  items: T[],
  id: string,
  idKey: string,
): number {
  return items.findIndex((item) => getItemValue(item, idKey) === id);
}

/**
 * Generate unique ID suffix
 */
function generateIdSuffix(): string {
  return Date.now().toString();
}

/**
 * Create copy suffix
 */
function createCopySuffix(copySuffix: string): string {
  return ` ${copySuffix}`;
}

/**
 * Update item timestamps
 */
function updateItemTimestamps<T extends ItemRecord>(item: T): void {
  const now = Date.now();
  const mutableItem = item as Record<string, unknown>;

  TIMESTAMP_FIELDS.forEach((field) => {
    if (hasKey(item, field)) {
      mutableItem[field] = now;
    }
  });
}

/**
 * Create duplicate item with updated IDs and titles
 */
function createDuplicateItem<T extends ItemRecord>(
  original: T,
  idKey: string,
  titleKey: string,
  slugKey: string,
  copySuffix: string,
  updateTimestamps: boolean,
): T {
  const suffix = generateIdSuffix();
  const duplicate: Record<string, unknown> = { ...original };

  // Update ID with unique suffix
  if (hasKey(original, idKey)) {
    const originalId = getItemValue(original, idKey);
    duplicate[idKey] = `${originalId}-copy-${suffix}`;
  }

  // Update title with copy suffix
  if (hasKey(original, titleKey)) {
    const originalTitle = getItemValue(original, titleKey);
    duplicate[titleKey] = `${originalTitle}${createCopySuffix(copySuffix)}`;
  }

  // Update slug with unique suffix
  if (hasKey(original, slugKey) && isString(getItemValue(original, slugKey))) {
    const originalSlug = getItemValue(original, slugKey);
    duplicate[slugKey] = `${originalSlug}-copy-${suffix}`;
  }

  // Update timestamps if enabled
  if (updateTimestamps) {
    updateItemTimestamps(duplicate);
  }

  if (import.meta.env.DEV) {
    console.debug("[useItemActions] Created duplicate item:", {
      originalId: getItemValue(original, idKey),
      duplicateId: duplicate[idKey],
    });
  }

  return duplicate as T;
}

/**
 * Create delete result
 */
function createDeleteResult(
  success: boolean,
  itemId: string | null = null,
  index: number = -1,
): DeleteResult {
  return { success, itemId, index };
}

/**
 * Create duplicate result
 */
function createDuplicateResult<T extends ItemRecord>(
  success: boolean,
  original: T,
  duplicate: T | null = null,
): DuplicateResult<T> {
  return { success, original, duplicate };
}

/**
 * List item rename/delete/duplicate
 *
 * Rename, delete, and duplicate with focus
 * management and state tracking. Works with any item type through
 * configurable key mappings.
 *
 * @param items - Reactive array of items
 * @param renameInputRef - Optional ref to rename input element
 * @param options - Configuration options
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useItemActions } from '@/composables/useItemActions';
 *
 * interface Page {
 *   id: string;
 *   title: string;
 *   slug: string;
 *   updated_at: number;
 * }
 *
 * const pages = ref<Page[]>([...]);
 * const renameInput = ref<HTMLInputElement | null>(null);
 *
 * const {
 *   editingId,
 *   isEditing,
 *   isEditingItem,
 *   startRename,
 *   finishRename,
 *   cancelRename,
 *   deleteItem,
 *   duplicateItem
 * } = useItemActions(pages, renameInput, {
 *   idKey: 'id',
 *   titleKey: 'title',
 *   deleteMessage: 'Delete this page?',
 *   copySuffix: 'Copy'
 * });
 *
 * // Start inline rename
 * async function handleRename(page: Page) {
 *   await startRename(page);
 * }
 *
 * // Delete with confirmation
 * async function handleDelete(pageId: string) {
 *   const result = await deleteItem(pageId);
 *   if (result.success) {
 *     console.log('Deleted page at index:', result.index);
 *   }
 * }
 *
 * // Duplicate page
 * function handleDuplicate(page: Page) {
 *   const result = duplicateItem(page);
 *   if (result.success) {
 *     console.log('Created duplicate:', result.duplicate);
 *   }
 * }
 * </script>
 *
 * <template>
 *   <div v-for="page in pages" :key="page.id">
 *     <input
 *       v-if="isEditingItem(page)"
 *       ref="renameInput"
 *       v-model="page.title"
 *       @blur="finishRename"
 *       @keydown.enter="finishRename"
 *       @keydown.esc="cancelRename"
 *     />
 *     <span v-else @dblclick="startRename(page)">
 *       {{ page.title }}
 *     </span>
 *
 *     <button @click="handleDelete(page.id)">Delete</button>
 *     <button @click="handleDuplicate(page)">Duplicate</button>
 *   </div>
 * </template>
 * ```
 */
export function useItemActions<T extends ItemRecord>(
  items: Ref<T[]>,
  renameInputRef?: Ref<HTMLInputElement | null> | Ref<unknown>,
  options: UseItemActionsOptions = {},
): UseItemActionsReturn<T> {

  const idKey = options.idKey ?? DEFAULT_ID_KEY;
  const titleKey = options.titleKey ?? DEFAULT_TITLE_KEY;
  const slugKey = options.slugKey ?? DEFAULT_SLUG_KEY;
  const copySuffix = options.copySuffix ?? DEFAULT_COPY_SUFFIX;
  const updateTimestamps = options.updateTimestamps ?? true;
  const deleteMessage = options.deleteMessage ?? DEFAULT_DELETE_MESSAGE;

  const confirmFn =
    options.confirmFn ?? ((message: string) => window.confirm(message));

  const editingId = ref<string | null>(null);

  /**
   * Whether any item is being edited
   */
  const isEditing = computed<boolean>(() => editingId.value !== null);

  /**
   * Check if specific item is being edited
   */
  function isEditingItem(item: T): boolean {
    if (!editingId.value) return false;

    const itemId = getItemValue(item, idKey);
    return itemId === editingId.value;
  }

  /**
   * Get item by ID
   */
  function getItemById(id: string): T | undefined {
    if (!isValidId(id)) return undefined;

    return items.value.find((item) => getItemValue(item, idKey) === id);
  }

  /**
   * Find item index by ID
   */
  function findItemIndex(id: string): number {
    if (!isValidId(id)) return -1;

    return findItemIndexById(items.value, id, idKey);
  }

  /**
   * Start inline rename operation
   *
   * Sets editing state and focuses input element on next tick.
   */
  async function startRename(item: T): Promise<void> {
    const itemId = getItemValue(item, idKey);

    if (!isValidId(itemId)) {
      console.warn("[useItemActions] Invalid item ID for rename:", item);
      return;
    }

    editingId.value = itemId;

    if (import.meta.env.DEV) {
      console.debug(`[useItemActions] Started rename for item: ${itemId}`);
    }

    // Wait for DOM update, then focus input
    await nextTick();

    const inputElement = extractInputElement(renameInputRef);

    if (inputElement) {
      focusInputAtEnd(inputElement);
    } else if (import.meta.env.DEV) {
      console.debug("[useItemActions] No input element found for focus");
    }
  }

  /**
   * Finish rename operation
   *
   * Clears editing state (value changes handled by v-model).
   */
  function finishRename(): void {
    if (editingId.value && import.meta.env.DEV) {
      console.debug(
        `[useItemActions] Finished rename for item: ${editingId.value}`,
      );
    }

    editingId.value = null;
  }

  /**
   * Cancel rename operation
   *
   * Alias for finishRename (could restore original value in future).
   */
  function cancelRename(): void {
    if (editingId.value && import.meta.env.DEV) {
      console.debug(
        `[useItemActions] Cancelled rename for item: ${editingId.value}`,
      );
    }

    finishRename();
  }

  /**
   * Delete item with confirmation
   *
   * Prompts user for confirmation, then removes item from array.
   *
   * @param id - Item ID to delete
   * @returns Delete result with success flag and index
   */
  async function deleteItem(id: string): Promise<DeleteResult> {
    if (!isValidId(id)) {
      console.warn("[useItemActions] Invalid ID for delete:", id);
      return createDeleteResult(false);
    }

    const index = findItemIndex(id);

    if (index === -1) {
      console.warn(`[useItemActions] Item not found for delete: ${id}`);
      return createDeleteResult(false);
    }

    // Await confirmation (supports async confirm functions)
    const confirmed = await confirmFn(deleteMessage);

    if (!confirmed) {
      if (import.meta.env.DEV) {
        console.debug(`[useItemActions] Delete cancelled for item: ${id}`);
      }
      return createDeleteResult(false);
    }

    // Remove item
    items.value.splice(index, 1);

    if (import.meta.env.DEV) {
      console.debug(`[useItemActions] Deleted item: ${id} at index ${index}`);
    }

    return createDeleteResult(true, id, index);
  }

  /**
   * Duplicate item with unique ID
   *
   * Creates copy with:
   * - Unique ID (original-copy-timestamp)
   * - Copy suffix on title
   * - Unique slug
   * - Updated timestamp
   *
   * @param item - Item to duplicate
   * @returns Duplicate result with original and duplicate
   */
  function duplicateItem(item: T): DuplicateResult<T> {
    try {
      const duplicate = createDuplicateItem(
        item,
        idKey,
        titleKey,
        slugKey,
        copySuffix,
        updateTimestamps,
      );

      items.value.push(duplicate);

      if (import.meta.env.DEV) {
        console.debug("[useItemActions] Duplicated item:", {
          originalId: getItemValue(item, idKey),
          duplicateId: getItemValue(duplicate, idKey),
        });
      }

      return createDuplicateResult(true, item, duplicate);
    } catch (error) {
      console.error("[useItemActions] Duplicate failed:", error);
      return createDuplicateResult(false, item);
    }
  }

  return {
    // State (readonly to prevent external mutation)
    editingId: readonly(editingId) as DeepReadonly<Ref<string | null>>,

    // Computed state
    isEditing,

    // Query operations
    isEditingItem,
    getItemById,
    findItemIndex,

    // Rename operations
    startRename,
    finishRename,
    cancelRename,

    // Delete operations
    deleteItem,

    // Duplicate operations
    duplicateItem,
  };
}

export type {
  ItemRecord,
  UseItemActionsOptions,
  DeleteResult,
  DuplicateResult,
};
