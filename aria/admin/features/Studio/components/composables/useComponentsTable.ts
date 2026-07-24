import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type ColumnDef,
} from "@tanstack/vue-table";
import { computed, h } from "vue";
import { z } from "zod";
import { studioIcons } from "@/lib/icons";
import type { Component } from "@/composables/useBuilderData";
import { Badge } from "@/components/ui/badge";
import { useTableSelection } from "@/features/Studio/core/composables/useTableSelection";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import type { InlineRenameReturn } from "@/features/Studio/core/composables/useInlineRename";
import { Button } from "@/components/ui/button";
import { usePersistentTableState } from "@/features/Studio/core/composables/usePersistentTableState";
import { useStudioI18n } from "@/i18n";

const VISIBILITY_KEY = "aria:components:table-columns";
const SORTING_KEY = "aria:components:table-sorting";
const COLUMN_ORDER_KEY = "aria:components:table-column-order";

const ColumnVisibilitySchema = z.record(z.string(), z.boolean());
const SortingEntrySchema = z.object({
  id: z.string().trim().min(1),
  desc: z.boolean(),
});
const SortingStateSchema = z.array(SortingEntrySchema);
const ColumnOrderStateSchema = z.array(z.string().trim().min(1));

const columnHelper = createColumnHelper<Component>();

export interface UseComponentsTableOptions {
  data: { value: Component[] };
  inlineRename?: InlineRenameReturn<string>;
}

export function useComponentsTable(options: UseComponentsTableOptions) {
  const { t } = useStudioI18n();
  const { rowSelection, createSelectColumn } = useTableSelection();
  const {
    columnVisibility,
    sorting,
    columnOrder,
    onColumnVisibilityChange,
    onSortingChange,
    onColumnOrderChange,
  } = usePersistentTableState({
    visibility: {
      key: VISIBILITY_KEY,
      defaultValue: {},
      parse: (value) => ColumnVisibilitySchema.parse(value),
      normalizeUpdatedState: (state) => ({ ...state, name: true }),
    },
    sorting: {
      key: SORTING_KEY,
      defaultValue: [],
      parse: (value) => SortingStateSchema.parse(value),
    },
    columnOrder: {
      key: COLUMN_ORDER_KEY,
      defaultValue: [],
      parse: (value) => ColumnOrderStateSchema.parse(value),
    },
  });

  const columns = computed<ColumnDef<Component, unknown>[]>(() => [
    createSelectColumn<Component>(),
    columnHelper.accessor((row) => row.name, {
      id: "name",
      minSize: 260,
      meta: { studioTableWidthMode: "flex" },
      header: t("components.column.component"),
      cell: ({ row }) => {
        const component = row.original;
        const isRenaming =
          options.inlineRename?.editingId.value === component.id;

        if (isRenaming && options.inlineRename) {
          return h("div", { class: "flex items-center gap-0.5 min-w-0" }, [
            h("input", {
              ref: options.inlineRename.inputRef,
              value: options.inlineRename.editingValue.value,
              onInput: (event: Event) => {
                options.inlineRename!.editingValue.value = (
                  event.target as HTMLInputElement
                ).value;
              },
              class:
                "h-auto bg-transparent text-sm font-medium text-foreground outline-none border-none p-0 min-w-[8ch]",
              onKeydown: options.inlineRename.handleRenameKeydown,
              onClick: (event: Event) => event.stopPropagation(),
            }),
            h(
              Button,
              {
                variant: "headerAction",
                size: "icon-header",
                onClick: (event: Event) => {
                  event.stopPropagation();
                  void options.inlineRename!.confirmRename();
                },
              },
              {
                default: () =>
                  h("span", {
                    class: `${studioIcons.published} size-3.5 text-primary`,
                  }),
              },
            ),
            h(
              Button,
              {
                variant: "headerAction",
                size: "icon-header",
                onClick: (event: Event) => {
                  event.stopPropagation();
                  options.inlineRename!.cancelRename();
                },
              },
              {
                default: () =>
                  h("span", {
                    class: `${studioIcons.close} size-3.5`,
                  }),
              },
            ),
          ]);
        }

        return h("div", { class: "min-w-0" }, [
          h(
            "span",
            { class: "block truncate text-sm font-medium text-foreground" },
            component.name || component.id,
          ),
        ]);
      },
    }),
    columnHelper.accessor("id", {
      id: "id",
      size: 220,
      minSize: 180,
      meta: { studioTableWidthMode: "min" },
      header: t("components.column.slug"),
      cell: ({ row }) =>
        h(
          "span",
          {
            class:
              "block max-w-full truncate text-xs font-mono text-muted-foreground/50 tabular-nums",
          },
          row.original.id,
        ),
    }),
    columnHelper.accessor((row) => row.category, {
      id: "category",
      size: 160,
      minSize: 140,
      meta: { studioTableWidthMode: "min" },
      header: t("components.column.category"),
      cell: ({ row }) =>
        h(
          "span",
          { class: "text-xs text-muted-foreground/80" },
          row.original.category || t("components.uncategorized"),
        ),
    }),
    columnHelper.accessor((row) => row.source, {
      id: "source",
      size: 132,
      minSize: 120,
      meta: { studioTableWidthMode: "min" },
      header: t("components.column.origin"),
      cell: ({ row }) =>
        h(
          Badge,
          {
            variant: row.original.source === "aria" ? "secondary" : "outline",
            class: "text-2xs",
          },
          {
            default: () =>
              row.original.source === "aria"
                ? t("components.ariaLibrary")
                : t("components.personal"),
          },
        ),
    }),
    columnHelper.accessor((row) => row.updatedAt, {
      id: "updated",
      size: 120,
      minSize: 112,
      meta: { studioTableWidthMode: "min" },
      header: t("components.column.updated"),
      cell: ({ row }) =>
        h(
          "span",
          { class: "text-xs text-muted-foreground tabular-nums" },
          row.original.updatedAt ? formatRelativeTime(row.original.updatedAt) : "—",
        ),
    }),
  ] as ColumnDef<Component, unknown>[]);

  const table = useVueTable({
    get data() {
      return options.data.value;
    },
    get columns() {
      return columns.value;
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      get rowSelection() {
        return rowSelection.value;
      },
      get columnVisibility() {
        return columnVisibility.value;
      },
      get sorting() {
        return sorting.value;
      },
      get columnOrder() {
        return columnOrder.value;
      },
    },
    enableRowSelection: true,
    onRowSelectionChange: (updater) => {
      rowSelection.value =
        typeof updater === "function" ? updater(rowSelection.value) : updater;
    },
    onColumnVisibilityChange,
    onSortingChange,
    onColumnOrderChange,
  });

  return {
    table,
    rowSelection,
    columnVisibility,
  };
}
