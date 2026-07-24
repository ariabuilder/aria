import { computed, h, ref, type ComputedRef, type Ref } from "vue";
import {
  type ColumnDef,
  type RowSelectionState,
  type Table,
} from "@tanstack/vue-table";
import TableCheckbox from "@/features/Studio/core/components/TableCheckbox.vue";

/**
 * Reusable TanStack column definition for a selection checkbox column.
 */
export function createSelectColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: "select",
    size: 40,
    maxSize: 40,
    meta: { studioTableWidthMode: "fixed" },
    header: ({ table }) =>
      h(TableCheckbox, {
        checked: table.getIsAllPageRowsSelected()
          ? true
          : table.getIsSomePageRowsSelected()
            ? ("indeterminate" as const)
            : false,
        "onUpdate:checked": (val: boolean) =>
          table.toggleAllPageRowsSelected(val),
      }),
    cell: ({ row }) =>
      h(TableCheckbox, {
        checked: row.getIsSelected(),
        disabled: !row.getCanSelect(),
        "onUpdate:checked": (val: boolean) => row.toggleSelected(val),
      }),
    enableSorting: false,
    enableHiding: false,
  };
}

/**
 * Derive selected entity identifiers from the table's current row selection.
 */
export function getSelectedIds<TData>(
  table: Table<TData> | undefined,
  keyFn: (row: TData) => string,
): string[] {
  const rows = table?.getRowModel()?.rows;
  if (!rows) {
    return [];
  }

  const ids: string[] = [];
  for (const row of rows) {
    if (row.getIsSelected()) {
      ids.push(keyFn(row.original));
    }
  }
  return ids;
}

/**
 * Reactive wrapper around {@link getSelectedIds}.
 */
export function useSelectedIds<TData>(
  table: Table<TData> | undefined,
  keyFn: (row: TData) => string,
  rowSelection?: Ref<RowSelectionState>,
): ComputedRef<string[]> {
  return computed(() => {
    if (rowSelection) {
      void rowSelection.value;
    }
    return getSelectedIds(table, keyFn);
  });
}

/** Reset TanStack row selection state. */
export function clearRowSelection(rowSelection: Ref<RowSelectionState>): void {
  rowSelection.value = {};
}

/**
 * Resolve bulk action targets from an optional single id and current selection.
 * When acting on a row that is part of a multi-selection, apply to the full selection.
 */
export function resolveBulkTargets(
  singleId: string | undefined,
  selectedIds: readonly string[] | undefined,
): string[] {
  const ids = selectedIds ?? [];

  if (singleId) {
    if (ids.length > 1 && ids.includes(singleId)) {
      return [...ids];
    }
    return [singleId];
  }
  if (ids.length > 0) {
    return [...ids];
  }
  return [];
}

/**
 * Reusable table multi-select composable. a TanStack-compatible select column
 * with a tri-state header checkbox, row-level checkboxes, and.
 */
export function useTableSelection() {
  const rowSelection = ref<RowSelectionState>({});

  return {
    rowSelection,
    createSelectColumn,
    getSelectedIds,
  };
}
