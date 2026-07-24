import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  useVueTable,
} from "@tanstack/vue-table";
import { computed, h, ref, watch, type ComputedRef, type Ref } from "vue";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStudioI18n } from "@/i18n";
import { useTableSelection } from "@/features/Studio/core/composables/useTableSelection";
import { valueUpdater } from "@/components/ui/table/utils";
import {
  CssCustomPropertyKeySchema,
  VariableSourceTypeSchema,
  type GlobalStyleVariableAlias,
  type GlobalStylesConfig,
} from "../../../../lib/styles/universalDesignSystem";
import VariableManagerSourceCell from "../components/VariableManagerSourceCell.vue";
import {
  buildVariableManagerRows,
  parseVariableManagerTableState,
  VariableManagerSegmentSchema,
  VariableManagerTableStateSchema,
  type VariableManagerRow,
  type VariableManagerSegment,
} from "../lib/variableManagerTable";
import {
  normalizeCssVariableKey,
  type VariableManagerTokenOption,
} from "../lib/variableManagerTokens";

interface VariableManagerOption {
  value: string;
  label: string;
}

type MaybePromise<T> = T | Promise<T>;

interface UseVariableManagerTableOptions {
  globalStyles: Ref<GlobalStylesConfig>;
  designTokenOptions: ComputedRef<readonly VariableManagerTokenOption[]>;
  customVariableOptions: ComputedRef<readonly VariableManagerOption[]>;
  tokenOptionsLoading?: Ref<boolean>;
  renameCustomVariableKey: (
    currentKey: string,
    nextKey: string,
  ) => MaybePromise<boolean | void>;
  renameAliasKey: (
    currentKey: string,
    nextKey: string,
  ) => MaybePromise<boolean | void>;
  duplicateCustomVariable: (key: string) => MaybePromise<string | null>;
  duplicateAlias: (key: string) => MaybePromise<string | null>;
  removeCustomVariable: (key: string) => MaybePromise<boolean | void>;
  removeAlias: (key: string) => MaybePromise<boolean | void>;
}

const columnHelper = createColumnHelper<VariableManagerRow>();
const STORAGE_KEY = "aria-variable-manager-table-state";
const MINIMAL_CELL_INPUT_CLASS =
  "h-8 rounded-md border border-transparent bg-transparent px-2.5 text-sm shadow-none transition-colors placeholder:text-muted-foreground/70 hover:border-border/50 hover:bg-card/30 focus-visible:border-border focus-visible:bg-background focus-visible:ring-0";
const MINIMAL_MONO_CELL_INPUT_CLASS = `${MINIMAL_CELL_INPUT_CLASS} font-mono text-[13px] text-foreground/90`;
const MINIMAL_KEY_CELL_INPUT_CLASS = `${MINIMAL_MONO_CELL_INPUT_CLASS} pl-8`;

function getStoredVariableManagerTableState() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return parseVariableManagerTableState({});
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return parseVariableManagerTableState({});
    }

    return parseVariableManagerTableState(JSON.parse(stored));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return parseVariableManagerTableState({});
  }
}

function buildSegmentColumnFilters(
  segment: VariableManagerSegment,
): ColumnFiltersState {
  if (segment === "all") {
    return [];
  }

  return [
    {
      id: "kind",
      value: segment,
    },
  ];
}

export function useVariableManagerTable(
  options: UseVariableManagerTableOptions,
) {
  const { t } = useStudioI18n();
  const initialState = getStoredVariableManagerTableState();
  const customKeyDrafts = ref<Record<string, string>>({});
  const aliasKeyDrafts = ref<Record<string, string>>({});
  const sorting = ref<SortingState>(initialState.sorting);
  const columnFilters = ref<ColumnFiltersState>(
    buildSegmentColumnFilters(initialState.segment),
  );
  const globalFilter = ref(initialState.query);
  const columnVisibility = ref<VisibilityState>({
    searchText: false,
  });
  const activeSegment = ref<VariableManagerSegment>(initialState.segment);

  const { rowSelection, createSelectColumn } = useTableSelection();

  const rows = computed<VariableManagerRow[]>(() =>
    buildVariableManagerRows(
      options.globalStyles.value.variables,
      options.designTokenOptions.value,
    ),
  );

  const counts = computed(() => {
    let custom = 0;
    let aliases = 0;

    for (const row of rows.value) {
      if (row.kind === "custom") {
        custom += 1;
        continue;
      }

      aliases += 1;
    }

    return {
      all: rows.value.length,
      custom,
      aliases,
    };
  });

  const filters = computed(() => [
    { key: "all" as VariableManagerSegment, label: t("design.variables.filter.all"), count: counts.value.all },
    {
      key: "custom" as VariableManagerSegment,
      label: t("design.variables.filter.variable"),
      count: counts.value.custom,
    },
    {
      key: "aliases" as VariableManagerSegment,
      label: t("design.variables.filter.alias"),
      count: counts.value.aliases,
    },
  ]);

  function syncCustomDraft(key: string, value: string): void {
    customKeyDrafts.value[key] = value;
  }

  function syncAliasDraft(key: string, value: string): void {
    aliasKeyDrafts.value[key] = value;
  }

  function normalizeKeyDraft(value: string, fallbackKey: string): string {
    const normalizedKey = normalizeCssVariableKey(value);
    const parsedKey = CssCustomPropertyKeySchema.safeParse(normalizedKey);
    return parsedKey.success ? parsedKey.data : fallbackKey;
  }

  function commitCustomKey(currentKey: string): void {
    const nextKey = normalizeKeyDraft(
      customKeyDrafts.value[currentKey] ?? currentKey,
      currentKey,
    );
    void options.renameCustomVariableKey(currentKey, nextKey);
    delete customKeyDrafts.value[currentKey];
  }

  function commitAliasKey(currentKey: string): void {
    const nextKey = normalizeKeyDraft(
      aliasKeyDrafts.value[currentKey] ?? currentKey,
      currentKey,
    );
    void options.renameAliasKey(currentKey, nextKey);
    delete aliasKeyDrafts.value[currentKey];
  }

  function updateAliasSourceType(
    alias: GlobalStyleVariableAlias,
    value: string,
  ): void {
    const parsedSourceType = VariableSourceTypeSchema.safeParse(value);
    if (
      !parsedSourceType.success ||
      alias.sourceType === parsedSourceType.data
    ) {
      return;
    }

    alias.sourceType = parsedSourceType.data;
    alias.sourceKey = "";
  }

  function updateAliasTokenSource(
    alias: GlobalStyleVariableAlias,
    optionValue: string | null,
  ): void {
    if (!optionValue) {
      return;
    }

    alias.sourceType = "token";
    alias.sourceKey = optionValue;

    if (!alias.label.trim()) {
      alias.label =
        options.designTokenOptions.value.find(
          (option) => option.value === optionValue,
        )?.suggestedLabel || alias.label;
    }
  }

  const columns = computed<ColumnDef<VariableManagerRow, any>[]>(() => {
    const nextColumns = [
      createSelectColumn<VariableManagerRow>(),
      columnHelper.accessor((row) => row.searchText, {
        id: "searchText",
        header: () => null,
        cell: () => null,
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: true,
      }),
      columnHelper.accessor(
        (row) => (row.kind === "custom" ? "custom" : "aliases"),
        {
          id: "kind",
          size: 100,
          header: t("design.variables.column.type"),
          cell: ({ row }) =>
            h("div", { class: "flex flex-col gap-2" }, [
              h(
                "span",
                {
                  class:
                    "inline-flex w-fit items-center rounded-md border border-transparent bg-transparent px-0 py-1 text-2xs font-medium uppercase tracking-widest text-muted-foreground transition-colors group-hover:bg-card/70 group-hover:text-foreground",
                },
                row.original.kind === "custom"
                  ? t("design.variables.type.variable")
                  : t("design.variables.type.alias"),
              ),
            ]),
          enableGlobalFilter: false,
          filterFn: (row, columnId, filterValue) => {
            if (filterValue !== "custom" && filterValue !== "aliases") {
              return true;
            }

            return row.getValue<string>(columnId) === filterValue;
          },
        },
      ),
      columnHelper.accessor((row) => row.key, {
        id: "key",
        size: 220,
        header: t("design.variables.column.key"),
        cell: ({ row }) => {
          const prefix = h(
            "span",
            {
              class:
                "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground/60",
            },
            "--",
          );

          if (row.original.kind === "custom") {
            return h("div", { class: "relative" }, [
              prefix,
              h(Input, {
                modelValue:
                  customKeyDrafts.value[row.original.key] ?? row.original.key,
                placeholder: "custom-var",
                class: MINIMAL_KEY_CELL_INPUT_CLASS,
                "onUpdate:modelValue": (value: string | number) => {
                  syncCustomDraft(row.original.key, String(value));
                },
                onBlur: () => {
                  commitCustomKey(row.original.key);
                },
              }),
            ]);
          }

          return h("div", { class: "relative" }, [
            prefix,
            h(Input, {
              modelValue:
                aliasKeyDrafts.value[row.original.key] ?? row.original.key,
              placeholder: "alias-var",
              class: MINIMAL_KEY_CELL_INPUT_CLASS,
              "onUpdate:modelValue": (value: string | number) => {
                syncAliasDraft(row.original.key, String(value));
              },
              onBlur: () => {
                commitAliasKey(row.original.key);
              },
            }),
          ]);
        },
        enableGlobalFilter: false,
      }),
      columnHelper.accessor((row) => row.label, {
        id: "label",
        size: 180,
        header: t("design.variables.column.label"),
        cell: ({ row }) => {
          if (row.original.kind === "custom") {
            const variable = row.original.variable;

            return h(Input, {
              modelValue: variable.label,
              placeholder: t("design.variables.placeholder.label"),
              class: MINIMAL_CELL_INPUT_CLASS,
              "onUpdate:modelValue": (value: string | number) => {
                variable.label = String(value);
              },
            });
          }

          const alias = row.original.alias;

          return h(Input, {
            modelValue: alias.label,
            placeholder: t("design.variables.placeholder.label"),
            class: MINIMAL_CELL_INPUT_CLASS,
            "onUpdate:modelValue": (value: string | number) => {
              alias.label = String(value);
            },
          });
        },
        enableGlobalFilter: false,
      }),
      columnHelper.accessor((row) => row.sourceLabel, {
        id: "source",
        size: 260,
        header: t("design.variables.column.source"),
        cell: ({ row }) =>
          h(VariableManagerSourceCell, {
            row: row.original,
            customVariableOptions: options.customVariableOptions.value,
            designTokenOptions: options.designTokenOptions.value,
            tokenOptionsLoading: options.tokenOptionsLoading?.value ?? false,
            onUpdateAliasSourceType: updateAliasSourceType,
            onUpdateAliasTokenSource: updateAliasTokenSource,
          }),
        enableGlobalFilter: false,
      }),
      columnHelper.accessor((row) => row.valueText, {
        id: "value",
        size: 180,
        header: t("design.variables.column.value"),
        cell: ({ row }) => {
          if (row.original.kind === "custom") {
            const variable = row.original.variable;

            return h(Input, {
              modelValue: variable.value,
              placeholder: t("design.variables.placeholder.value"),
              class: MINIMAL_MONO_CELL_INPUT_CLASS,
              "onUpdate:modelValue": (value: string | number) => {
                variable.value = String(value);
              },
            });
          }

          const alias = row.original.alias;

          return h(Input, {
            modelValue: alias.fallback,
            placeholder: t("design.variables.placeholder.fallback"),
            class: MINIMAL_MONO_CELL_INPUT_CLASS,
            "onUpdate:modelValue": (value: string | number) => {
              alias.fallback = String(value);
            },
          });
        },
        enableGlobalFilter: false,
      }),
      columnHelper.display({
        id: "actions",
        size: 112,
        header: () => null,
        cell: ({ row }) =>
          h("div", { class: "flex items-center justify-end gap-1.5" }, [
            h(
              Button,
              {
                size: "icon-sm",
                variant: "ghost",
                class:
                  "h-8 w-8 rounded-md opacity-0 transition-all duration-150 group-hover:opacity-100 focus-visible:opacity-100",
                title:
                  row.original.kind === "custom"
                    ? t("design.variables.action.duplicateVariable")
                    : t("design.variables.action.duplicateAlias"),
                "aria-label":
                  row.original.kind === "custom"
                    ? t("design.variables.action.duplicateVariable")
                    : t("design.variables.action.duplicateAlias"),
                onClick: () => {
                  if (row.original.kind === "custom") {
                    void options.duplicateCustomVariable(row.original.key);
                    return;
                  }

                  void options.duplicateAlias(row.original.key);
                },
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
                  row.original.kind === "custom"
                    ? t("design.variables.action.deleteVariable")
                    : t("design.variables.action.deleteAlias"),
                "aria-label":
                  row.original.kind === "custom"
                    ? t("design.variables.action.deleteVariable")
                    : t("design.variables.action.deleteAlias"),
                onClick: () => {
                  if (row.original.kind === "custom") {
                    void options.removeCustomVariable(row.original.key);
                    return;
                  }

                  void options.removeAlias(row.original.key);
                },
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
    ] satisfies ColumnDef<VariableManagerRow, any>[];

    return nextColumns;
  });

  const table = useVueTable<VariableManagerRow>({
    get data() {
      return rows.value;
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
    onRowSelectionChange: (updater: any) => {
      rowSelection.value =
        typeof updater === "function"
          ? updater(rowSelection.value)
          : updater;
    },
    onSortingChange: (updater) => valueUpdater(updater, sorting),
    onColumnFiltersChange: (updater) => valueUpdater(updater, columnFilters),
    onGlobalFilterChange: (updater) => valueUpdater(updater, globalFilter),
    onColumnVisibilityChange: (updater) =>
      valueUpdater(updater, columnVisibility),
  });

  const searchQuery = computed({
    get: () => globalFilter.value,
    set: (value: string) => {
      globalFilter.value = value;
    },
  });

  const filteredRowCount = computed(() => table.getRowModel().rows.length);

  const hasActiveFilters = computed(
    () => globalFilter.value.trim().length > 0 || activeSegment.value !== "all",
  );

  function setActiveSegment(value: string): void {
    const parsedSegment = VariableManagerSegmentSchema.safeParse(value);
    if (!parsedSegment.success) {
      return;
    }

    activeSegment.value = parsedSegment.data;

    const nextFilters = columnFilters.value.filter(
      (filter) => filter.id !== "kind",
    );

    if (parsedSegment.data !== "all") {
      nextFilters.push({
        id: "kind",
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

      const persistedState = VariableManagerTableStateSchema.parse({
        query,
        segment,
        sourceFilter: "all",
        sorting: nextSorting,
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
    },
    { deep: true },
  );

  return {
    table,
    rows,
    rowSelection,
    filteredRowCount,
    searchQuery,
    activeSegment,
    counts,
    filters,
    hasActiveFilters,
    setActiveSegment,
    resetFilters,
  };
}
