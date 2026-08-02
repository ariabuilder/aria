import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type Updater,
  type VisibilityState,
  useVueTable,
} from "@tanstack/vue-table";
import { computed, h, ref, watch, type ComputedRef } from "vue";

import { Button } from "@/components/ui/button";
import { useStudioI18n } from "@/i18n";
import type { InlineRenameReturn } from "@/features/Studio/core/composables/useInlineRename";
import { useTableSelection } from "@/features/Studio/core/composables/useTableSelection";
import { valueUpdater } from "@/components/ui/table/utils";
import {
  ClassManagerSegmentSchema,
  ClassManagerTableStateSchema,
  parseClassManagerTableState,
  type ClassManagerRow,
  type ClassManagerSegment,
} from "../lib/classManagerTable";

interface UseClassManagerTableOptions {
  rows: ComputedRef<ClassManagerRow[]>;
  onEditCss: (row: ClassManagerRow) => void;
  onRenameClass: (row: ClassManagerRow) => void;
  onDuplicateClass: (row: ClassManagerRow) => void;
  onDeleteClass: (row: ClassManagerRow) => void;
  /** Inline rename state from useInlineRename. Omit to disable inline rename. */
  inlineRename?: InlineRenameReturn<string>;
}

const columnHelper = createColumnHelper<ClassManagerRow>();
const STORAGE_KEY = "aria-class-manager-table-state";
const COLUMN_VISIBILITY_KEY = "aria:class-manager:table-columns";

function loadColumnVisibility(): VisibilityState {
  try {
    const raw = localStorage.getItem(COLUMN_VISIBILITY_KEY);
    if (raw) return JSON.parse(raw) as VisibilityState;
  } catch {}
  return {};
}

function saveColumnVisibility(state: VisibilityState) {
  try {
    localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(state));
  } catch {}
}

function getStoredClassManagerTableState() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return parseClassManagerTableState({});
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return parseClassManagerTableState({});
    }

    return parseClassManagerTableState(JSON.parse(stored));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return parseClassManagerTableState({});
  }
}

function buildSegmentColumnFilters(
  segment: ClassManagerSegment,
): ColumnFiltersState {
  if (segment === "all") {
    return [];
  }

  return [{ id: "status", value: segment }];
}

export function useClassManagerTable(options: UseClassManagerTableOptions) {
  const { locale, t } = useStudioI18n();
  const initialState = getStoredClassManagerTableState();
  const sorting = ref<SortingState>(initialState.sorting);
  const columnFilters = ref<ColumnFiltersState>(
    buildSegmentColumnFilters(initialState.segment),
  );
  const globalFilter = ref(initialState.query);
  const columnVisibility = ref<VisibilityState>({
    searchText: false,
    ...loadColumnVisibility(),
  });
  const activeSegment = ref<ClassManagerSegment>(initialState.segment);

  const { rowSelection, createSelectColumn } = useTableSelection();

  const counts = computed(() => {
    let used = 0;
    let unused = 0;
    let orphaned = 0;

    for (const row of options.rows.value) {
      if (row.status === "used") {
        used += 1;
        continue;
      }

      if (row.status === "unused") {
        unused += 1;
        continue;
      }

      orphaned += 1;
    }

    return {
      all: options.rows.value.length,
      used,
      unused,
      orphaned,
    };
  });

  const filters = computed(() => [
    {
      key: "all" as ClassManagerSegment,
      label: t("design.classes.filter.all"),
      count: counts.value.all,
    },
    {
      key: "used" as ClassManagerSegment,
      label: t("design.classes.filter.used"),
      count: counts.value.used,
    },
    {
      key: "unused" as ClassManagerSegment,
      label: t("design.classes.filter.unused"),
      count: counts.value.unused,
    },
    {
      key: "orphaned" as ClassManagerSegment,
      label: t("design.classes.filter.orphaned"),
      count: counts.value.orphaned,
    },
  ]);

  function getStatusLabel(status: ClassManagerRow["status"]): string {
    switch (status) {
      case "used":
        return t("design.classes.status.used");
      case "unused":
        return t("design.classes.status.unused");
      case "orphaned":
        return t("design.classes.status.orphaned");
    }
  }

  function formatDateLabel(value: string, fallback: string): string {
    if (!value.trim()) {
      if (fallback === "Missing definition") {
        return t("design.classes.missingDefinition");
      }

      if (fallback === "N/A") {
        return t("design.classes.notApplicable");
      }

      return t("design.classes.notUpdatedYet");
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(locale.value, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(parsedDate);
  }

  function formatCssSummary(row: ClassManagerRow): string {
    if (row.classDefinition === null) {
      return t("design.classes.missingClassDefinition");
    }

    if (row.cssSummary === "Advanced CSS") {
      return t("design.classes.advancedCss");
    }

    if (row.cssSummary === "No rules yet") {
      return t("design.classes.noRulesYet");
    }

    return row.cssSummary.replace(
      /Advanced CSS$/u,
      t("design.classes.advancedCss"),
    );
  }

  const columns = computed(() => {
    const nextColumns = [
      createSelectColumn<ClassManagerRow>(),
      columnHelper.accessor((row) => row.searchText, {
        id: "searchText",
        header: () => null,
        cell: () => null,
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: true,
      }),
      columnHelper.accessor((row) => row.name, {
        id: "name",
        size: 240,
        header: t("design.classes.column.class"),
        cell: ({ row }) => {
          const isEditing =
            options.inlineRename &&
            options.inlineRename.editingId.value === row.original.id;

          return isEditing
            ? h("div", { class: "flex min-w-0 items-center gap-1" }, [
                h("input", {
                  ref: options.inlineRename!.inputRef,
                  value: options.inlineRename!.editingValue.value,
                  onInput: (e: Event) => {
                    options.inlineRename!.editingValue.value = (
                      e.target as HTMLInputElement
                    ).value;
                  },
                  class:
                    "h-auto min-w-[10ch] border-none bg-transparent p-0 font-mono text-[13px] text-foreground/90 outline-none",
                  onKeydown: options.inlineRename!.handleRenameKeydown,
                  onClick: (e: Event) => e.stopPropagation(),
                }),
                h(
                  Button,
                  {
                    variant: "ghost",
                    size: "icon-sm",
                    class: "size-4 p-0 text-emerald-500 hover:text-emerald-600",
                    title: t("common.save"),
                    "aria-label": t("common.save"),
                    onClick: (e: Event) => {
                      e.stopPropagation();
                      void options.inlineRename!.confirmRename();
                    },
                  },
                  {
                    default: () =>
                      h("span", {
                        class: "i-hugeicons:checkmark-circle-01 size-3.5",
                      }),
                  },
                ),
                h(
                  Button,
                  {
                    variant: "ghost",
                    size: "icon-sm",
                    class:
                      "size-4 p-0 text-muted-foreground hover:text-destructive",
                    title: t("common.cancel"),
                    "aria-label": t("common.cancel"),
                    onClick: (e: Event) => {
                      e.stopPropagation();
                      options.inlineRename!.cancelRename();
                    },
                  },
                  {
                    default: () =>
                      h("span", { class: "i-hugeicons:cancel-01 size-3.5" }),
                  },
                ),
              ])
            : h(
                "p",
                {
                  class:
                    "min-w-0 truncate font-mono text-[13px] text-foreground/90",
                },
                row.original.name,
              );
        },
        enableGlobalFilter: false,
      }),
      columnHelper.accessor((row) => row.status, {
        id: "status",
        size: 120,
        header: t("design.classes.column.status"),
        cell: ({ row }) =>
          h(
            "span",
            {
              class:
                "inline-flex w-fit items-center rounded-md border border-transparent bg-transparent px-1 py-1 text-2xs font-medium uppercase tracking-widest text-muted-foreground transition-colors group-hover:bg-card/70 group-hover:text-foreground",
            },
            getStatusLabel(row.original.status),
          ),
        enableGlobalFilter: false,
        filterFn: (row, columnId, filterValue) => {
          if (
            filterValue !== "used" &&
            filterValue !== "unused" &&
            filterValue !== "orphaned"
          ) {
            return true;
          }

          return row.getValue<string>(columnId) === filterValue;
        },
      }),
      columnHelper.accessor((row) => row.usageCount, {
        id: "usageCount",
        size: 100,
        header: t("design.classes.column.usage"),
        cell: ({ row }) =>
          h(
            "p",
            { class: "font-mono text-[13px] text-foreground/90" },
            row.original.usageCount === 1
              ? t("design.classes.usageRef", { count: row.original.usageCount })
              : t("design.classes.usageRefs", { count: row.original.usageCount }),
          ),
        enableGlobalFilter: false,
      }),
      columnHelper.accessor((row) => row.variantBreakpointsLabel, {
        id: "variantBreakpoints",
        size: 160,
        header: t("design.classes.column.breakpoints"),
        cell: ({ row }) =>
          row.original.variantBreakpoints.length > 0
            ? h(
                "div",
                { class: "flex flex-wrap gap-1" },
                row.original.variantBreakpoints.map((bp) =>
                  h(
                    "span",
                    {
                      class:
                        "inline-flex items-center rounded-md border border-border/50 bg-transparent px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground",
                    },
                    bp,
                  ),
                ),
              )
            : h(
                "span",
                { class: "text-xs text-muted-foreground/50 italic" },
                "—",
              ),
        sortingFn: (leftRow, rightRow) => {
          const left = leftRow.original.variantBreakpoints.length;
          const right = rightRow.original.variantBreakpoints.length;
          if (left !== right) return left - right;
          return leftRow.original.variantBreakpointsLabel.localeCompare(
            rightRow.original.variantBreakpointsLabel,
          );
        },
        enableGlobalFilter: false,
      }),
      columnHelper.accessor((row) => row.createdAt, {
        id: "createdAt",
        size: 140,
        header: t("design.classes.column.created"),
        cell: ({ row }) =>
          h(
            "span",
            { class: "text-xs leading-5 text-muted-foreground" },
            formatDateLabel(row.original.createdAt, row.original.createdAtLabel),
          ),
        sortingFn: (leftRow, rightRow) => {
          const left = leftRow.original.createdAt || "";
          const right = rightRow.original.createdAt || "";
          return left.localeCompare(right);
        },
        enableGlobalFilter: false,
      }),
      columnHelper.accessor((row) => row.updatedAt, {
        id: "updatedAt",
        size: 140,
        header: t("design.classes.column.updated"),
        cell: ({ row }) =>
          h(
            "span",
            { class: "text-xs leading-5 text-muted-foreground" },
            formatDateLabel(row.original.updatedAt, row.original.updatedAtLabel),
          ),
        sortingFn: (leftRow, rightRow) => {
          const left = leftRow.original.updatedAt || "";
          const right = rightRow.original.updatedAt || "";
          return left.localeCompare(right);
        },
        enableGlobalFilter: false,
      }),
      columnHelper.accessor((row) => row.cssSummary, {
        id: "css",
        header: t("design.classes.column.css"),
        meta: { studioTableWidthMode: "flex" },
        cell: ({ row }) =>
          h(
            "p",
            {
              class: "truncate font-mono text-[13px] text-foreground/90",
              title: formatCssSummary(row.original),
            },
            formatCssSummary(row.original),
          ),
        enableSorting: false,
        enableGlobalFilter: false,
      }),
      columnHelper.display({
        id: "actions",
        size: 160,
        maxSize: 160,
        meta: { studioTableWidthMode: "fixed" },
        header: "",
        cell: ({ row }) =>
          h("div", { class: "flex items-center justify-end gap-1.5" }, [
            h(
              Button,
              {
                size: "icon-sm",
                variant: "ghost",
                class:
                  "h-8 w-8 rounded-md opacity-0 transition-all duration-150 group-hover:opacity-100 focus-visible:opacity-100",
                title: t("design.classes.action.editCss"),
                "aria-label": t("design.classes.action.editCss"),
                disabled: row.original.classDefinition === null,
                onClick: () => options.onEditCss(row.original),
              },
              {
                default: () =>
                  h("span", {
                    class: "i-hugeicons:source-code size-4",
                  }),
              },
            ),
            h(
              Button,
              {
                size: "icon-sm",
                variant: "ghost",
                class:
                  "h-8 w-8 rounded-md opacity-0 transition-all duration-150 group-hover:opacity-100 focus-visible:opacity-100",
                title: t("design.classes.action.rename"),
                "aria-label": t("design.classes.action.rename"),
                disabled: row.original.classDefinition === null,
                onClick: () => options.onRenameClass(row.original),
              },
              {
                default: () =>
                  h("span", {
                    class: "i-hugeicons:edit-03 size-4",
                  }),
              },
            ),
            h(
              Button,
              {
                size: "icon-sm",
                variant: "ghost",
                class:
                  "h-8 w-8 rounded-md opacity-0 transition-all duration-150 group-hover:opacity-100 focus-visible:opacity-100",
                title: t("design.classes.action.duplicate"),
                "aria-label": t("design.classes.action.duplicate"),
                disabled: row.original.classDefinition === null,
                onClick: () => options.onDuplicateClass(row.original),
              },
              {
                default: () =>
                  h("span", {
                    class: "i-hugeicons:copy-01 size-4",
                  }),
              },
            ),
            h(
              Button,
              {
                size: "icon-sm",
                variant: "ghost",
                class:
                  "h-8 w-8 rounded-md opacity-0 transition-all duration-150 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-destructive/8 hover:text-destructive",
                title:
                  row.original.classDefinition === null
                    ? t("design.classes.action.removeOrphanedReference")
                    : t("design.classes.action.delete"),
                "aria-label":
                  row.original.classDefinition === null
                    ? t("design.classes.action.removeOrphanedReference")
                    : t("design.classes.action.delete"),
                onClick: () => options.onDeleteClass(row.original),
              },
              {
                default: () =>
                  h("span", {
                    class: "i-hugeicons:delete-01 size-4",
                  }),
              },
            ),
          ]),
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: false,
      }),
    ];

    return nextColumns;
  });

  const table = useVueTable<ClassManagerRow>({
    get data() {
      return options.rows.value;
    },
    get columns() {
      return columns.value;
    },
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      get sorting() {
        return sorting.value;
      },
      get columnFilters() {
        return columnFilters.value;
      },
      get globalFilter() {
        return globalFilter.value;
      },
      get columnVisibility() {
        return columnVisibility.value;
      },
      get rowSelection() {
        return rowSelection.value;
      },
    },
    enableRowSelection: true,
    onRowSelectionChange: (updater: Updater<RowSelectionState>) => {
      rowSelection.value =
        typeof updater === "function" ? updater(rowSelection.value) : updater;
    },
    onSortingChange: (updater) => valueUpdater(updater, sorting),
    onColumnFiltersChange: (updater) => valueUpdater(updater, columnFilters),
    onGlobalFilterChange: (updater) => valueUpdater(updater, globalFilter),
    onColumnVisibilityChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater(columnVisibility.value)
          : updater;
      // The "name" column must always remain visible.
      columnVisibility.value = { ...next, name: true };
      saveColumnVisibility(columnVisibility.value);
    },
  });

  const searchQuery = computed({
    get: () => globalFilter.value,
    set: (value: string) => {
      globalFilter.value = value;
    },
  });

  const hasActiveFilters = computed(
    () => globalFilter.value.trim().length > 0 || activeSegment.value !== "all",
  );

  function setActiveSegment(value: string): void {
    const parsedSegment = ClassManagerSegmentSchema.safeParse(value);
    if (!parsedSegment.success) {
      return;
    }

    activeSegment.value = parsedSegment.data;

    const nextFilters = columnFilters.value.filter(
      (filter) => filter.id !== "status",
    );

    if (parsedSegment.data !== "all") {
      nextFilters.push({
        id: "status",
        value: parsedSegment.data,
      });
    }

    columnFilters.value = nextFilters;
  }

  function resetFilters(): void {
    globalFilter.value = "";
    activeSegment.value = "all";
    columnFilters.value = buildSegmentColumnFilters("all");
  }

  watch(
    [globalFilter, activeSegment, sorting],
    ([query, segment, nextSorting]) => {
      if (
        typeof window === "undefined" ||
        typeof localStorage === "undefined"
      ) {
        return;
      }

      const persistedState = ClassManagerTableStateSchema.parse({
        query,
        segment,
        sorting: nextSorting,
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
    },
    { deep: true },
  );

  return {
    table,
    searchQuery,
    activeSegment,
    counts,
    filters,
    hasActiveFilters,
    rowSelection,
    columnVisibility,
    setActiveSegment,
    resetFilters,
  };
}
