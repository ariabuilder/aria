import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type ColumnSizingState,
  type VisibilityState,
} from "@tanstack/vue-table";
import { computed, h, ref, watch, type Ref } from "vue";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import { useTableSelection } from "@/features/Studio/core/composables/useTableSelection";
import { usePersistentTableState } from "@/features/Studio/core/composables/usePersistentTableState";
import type { CollectionSummary } from "./useCollectionsList";
import CmsCollectionIconPreview from "../components/CmsCollectionIconPreview.vue";
import { useStudioI18n } from "@/i18n";

const columnHelper = createColumnHelper<CollectionSummary>();
const VISIBILITY_KEY = "aria:cms:collections:table-columns";
const SORTING_KEY = "aria:cms:collections:table-sorting";
const COLUMN_ORDER_KEY = "aria:cms:collections:table-column-order";
const REQUIRED_VISIBLE_COLUMNS = ["label"] as const;
const VisibilityStateSchema = z.record(z.string(), z.boolean()).catch({});
const SortingStateSchema = z
  .array(
    z
      .object({
        id: z.string().trim().min(1),
        desc: z.boolean(),
      })
      .strict(),
  )
  .catch([{ id: "label", desc: false }]);
const ColumnOrderStateSchema = z.array(z.string().trim().min(1)).catch([]);

function ensureCollectionVisibility(state: VisibilityState): VisibilityState {
  return REQUIRED_VISIBLE_COLUMNS.reduce<VisibilityState>(
    (next, columnId) => ({ ...next, [columnId]: true }),
    { ...state },
  );
}

export interface UseCmsCollectionsTableOptions {
  data: Ref<CollectionSummary[]>;
  getCollectionIconClass: (collection: CollectionSummary) => string;
}

export function useCmsCollectionsTable(options: UseCmsCollectionsTableOptions) {
  const { t } = useStudioI18n();
  const { rowSelection, createSelectColumn } = useTableSelection();
  const {
    columnVisibility,
    sorting,
    columnOrder,
    onColumnVisibilityChange,
    onSortingChange,
    onColumnOrderChange,
    setColumnVisibility,
  } = usePersistentTableState({
    visibility: {
      key: VISIBILITY_KEY,
      defaultValue: () => ensureCollectionVisibility({ createdAt: false }),
      parse: (value) => VisibilityStateSchema.parse(value),
      normalizeLoadedState: ensureCollectionVisibility,
      normalizeUpdatedState: ensureCollectionVisibility,
      persistLoadedState: true,
    },
    sorting: {
      key: SORTING_KEY,
      defaultValue: [{ id: "label", desc: false }],
      parse: (value) => SortingStateSchema.parse(value),
    },
    columnOrder: {
      key: COLUMN_ORDER_KEY,
      defaultValue: [],
      parse: (value) => ColumnOrderStateSchema.parse(value),
    },
  });
  const columnSizing = ref<ColumnSizingState>({});

  const columns = computed(() => [
    createSelectColumn<CollectionSummary>(),
    columnHelper.accessor((row) => row.label, {
      id: "label",
      minSize: 260,
      enableHiding: false,
      meta: { studioTableWidthMode: "flex" },
      header: t("collections.column.name"),
      cell: ({ row }) =>
        h("div", { class: "flex min-w-0 items-center gap-3" }, [
          h(CmsCollectionIconPreview, {
            value: options.getCollectionIconClass(row.original),
            class: "size-4 shrink-0 text-muted-foreground",
          }),
          h("div", { class: "min-w-0" }, [
            h(
              "span",
              {
                class: "block truncate text-sm font-medium text-foreground",
              },
              row.original.label,
            ),
          ]),
        ]),
    }),
    columnHelper.accessor((row) => row.name, {
      id: "name",
      minSize: 220,
      size: 220,
      meta: { studioTableWidthMode: "min" },
      header: t("collections.column.slug"),
      cell: ({ row }) =>
        h(
          "span",
          {
            class:
              "block max-w-full truncate font-mono text-xs text-muted-foreground/60 tabular-nums",
          },
          row.original.name,
        ),
    }),
    columnHelper.accessor((row) => row.kind, {
      id: "kind",
      size: 120,
      meta: { studioTableWidthMode: "fixed" },
      header: t("collections.column.kind"),
      cell: ({ row }) =>
        h(
          Badge,
          {
            variant: "secondary",
            class: "capitalize",
          },
          () => row.original.kind,
        ),
    }),
    columnHelper.accessor((row) => row.itemCount, {
      id: "itemCount",
      size: 104,
      meta: { studioTableWidthMode: "fixed" },
      header: t("collections.column.entries"),
      cell: ({ row }) =>
        h(
          "span",
          {
            class: "text-xs text-muted-foreground tabular-nums",
          },
          String(row.original.itemCount),
        ),
    }),
    columnHelper.accessor((row) => row.updatedAt, {
      id: "updatedAt",
      size: 112,
      meta: { studioTableWidthMode: "fixed" },
      header: t("collections.column.updated"),
      cell: ({ row }) =>
        h(
          "span",
          {
            class: "text-xs text-muted-foreground tabular-nums",
          },
          formatRelativeTime(row.original.updatedAt),
        ),
    }),
    columnHelper.accessor((row) => row.createdAt, {
      id: "createdAt",
      size: 112,
      meta: { studioTableWidthMode: "fixed" },
      header: t("collections.column.created"),
      cell: ({ row }) =>
        h(
          "span",
          {
            class: "text-xs text-muted-foreground tabular-nums",
          },
          formatRelativeTime(row.original.createdAt),
        ),
    }),
  ]);

  watch(
    columnVisibility,
    (visibility) => {
      const next = ensureCollectionVisibility(visibility);
      if (JSON.stringify(next) !== JSON.stringify(visibility)) {
        setColumnVisibility(next);
      }
    },
    { immediate: true },
  );

  const table = useVueTable<CollectionSummary>({
    get data() {
      return options.data.value;
    },
    getRowId: (row) => row.id,
    get columns() {
      return columns.value;
    },
    state: {
      get columnOrder() {
        return columnOrder.value;
      },
      get columnSizing() {
        return columnSizing.value;
      },
      get columnVisibility() {
        return columnVisibility.value;
      },
      get sorting() {
        return sorting.value;
      },
      get rowSelection() {
        return rowSelection.value;
      },
    },
    enableRowSelection: true,
    onColumnVisibilityChange,
    onSortingChange,
    onColumnSizingChange: (updater) => {
      columnSizing.value =
        typeof updater === "function" ? updater(columnSizing.value) : updater;
    },
    onRowSelectionChange: (updater) => {
      rowSelection.value =
        typeof updater === "function" ? updater(rowSelection.value) : updater;
    },
    onColumnOrderChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return { table, sorting, columnVisibility, rowSelection };
}
