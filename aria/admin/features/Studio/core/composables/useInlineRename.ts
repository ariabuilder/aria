import { ref, nextTick } from "vue";
import type { Ref } from "vue";

export interface InlineRenameOptions<TId = string> {
  commitRename: (id: TId, newValue: string) => Promise<boolean | void>;
}

export interface InlineRenameReturn<TId = string> {
  editingId: Ref<TId | null>;
  /** The current value of the inline input. */
  editingValue: Ref<string>;
  /** Template ref to attach to the `<Input>` for auto-focus. */
  inputRef: Ref<HTMLInputElement | null>;
  /** Enter edit mode for the given entity. Auto-focuses and selects all. */
  startRename: (id: TId, currentValue: string) => void;
  /** Commit the rename via `commitRename` and exit edit mode. */
  confirmRename: () => Promise<void>;
  /** Exit edit mode without saving. */
  cancelRename: () => void;
  /** Keyboard handler: Enter → confirm, Escape → cancel. */
  handleRenameKeydown: (event: KeyboardEvent) => void;
}

/**
 * Reusable inline-rename state machine for TanStack table cells.
 *
 * Inline rename UI state: enter/exit edit mode,
 * keyboard shortcuts (Enter / Escape), auto-focus + select-all,
 * and commit / cancel lifecycle.
 *
 * @example
 * ```ts
 * const rename = useInlineRename({
 *   commitRename: async (slug, title) => {
 *     await actions.pages.rename({ slug, title });
 *   },
 * });
 *
 * // In your table cell:
 * if (rename.editingId.value === row.id) {
 *   return h('div', {}, [
 *     h(Input, {
 *       modelValue: rename.editingValue.value,
 *       ref: rename.inputRef,
 *       onKeydown: rename.handleRenameKeydown,
 *     }),
 *     h(Button, { onClick: rename.confirmRename }, '✓'),
 *     h(Button, { onClick: rename.cancelRename }, '✗'),
 *   ]);
 * }
 * return h('span', row.name);
 * ```
 */
export function useInlineRename<TId = string>(
  options: InlineRenameOptions<TId>,
): InlineRenameReturn<TId> {
  const editingId = ref<TId | null>(null) as Ref<TId | null>;
  const editingValue = ref("");
  const inputRef = ref<HTMLInputElement | null>(null);

  /** The original value when edit mode started (used to detect no-op). */
  let originalValue = "";

  function startRename(id: TId, currentValue: string): void {
    editingId.value = id;
    editingValue.value = currentValue;
    originalValue = currentValue;

    void nextTick(() => {
      requestAnimationFrame(() => {
        const el = inputRef.value;
        if (!el) return;

        el.focus();
        el.select();
      });
    });
  }

  function cancelRename(): void {
    editingId.value = null;
    editingValue.value = "";
    originalValue = "";
  }

  async function confirmRename(): Promise<void> {
    const id = editingId.value;
    if (id === null || id === undefined) return;

    const trimmed = editingValue.value.trim();
    if (!trimmed || trimmed === originalValue) {
      cancelRename();
      return;
    }

    try {
      await options.commitRename(id, trimmed);
    } finally {
      cancelRename();
    }
  }

  function handleRenameKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void confirmRename();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  }

  return {
    editingId,
    editingValue,
    inputRef,
    startRename,
    confirmRename,
    cancelRename,
    handleRenameKeydown,
  };
}
