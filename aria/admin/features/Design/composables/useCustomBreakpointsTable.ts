import {
  createColumnHelper,
  getCoreRowModel,
  useVueTable,
  type ColumnDef,
} from "@tanstack/vue-table";
import { computed, h, ref } from "vue";
import { studioIcons } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStudioI18n } from "@/i18n";
import { getBreakpointIconClass } from "../../../composables/breakpointIcons";
import type { UniversalBreakpointItem } from "../../../../lib/styles/universalDesignSystem";

export interface CustomBreakpointRow extends UniversalBreakpointItem {
  /** Derived max width — null means unbounded (highest breakpoint). */
  maxWidth: number | null;
}

export interface BreakpointEditForm {
  label: string;
  width: string;
}

const EMPTY_EDIT_FORM: BreakpointEditForm = {
  label: "",
  width: "",
};

function resolveWidth(bp: UniversalBreakpointItem): number {
  return bp.canvasWidth ?? bp.minWidth;
}

/**
 * Derive the max width for a breakpoint by finding the next larger
 * breakpoint and subtracting 1. Returns null if there is none (unbounded).
 */
function deriveMaxWidth(
  breakpoint: UniversalBreakpointItem,
  allBreakpoints: readonly UniversalBreakpointItem[],
): number | null {
  const sorted = [...allBreakpoints].sort(
    (a, b) => resolveWidth(b) - resolveWidth(a),
  );
  const idx = sorted.findIndex((s) => s.id === breakpoint.id);
  const nextLarger = idx > 0 ? sorted[idx - 1] : null;
  return nextLarger ? resolveWidth(nextLarger) - 1 : null;
}

function buildCustomRows(
  breakpoints: readonly UniversalBreakpointItem[],
): CustomBreakpointRow[] {
  return breakpoints
    .filter((bp) => !bp.isDefault)
    .map((bp) => ({
      ...bp,
      maxWidth: deriveMaxWidth(bp, breakpoints),
    }));
}

const columnHelper = createColumnHelper<CustomBreakpointRow>();

const MINIMAL_CELL_INPUT_CLASS =
  "h-7 rounded-md border border-transparent bg-transparent px-2 text-sm shadow-none transition-colors placeholder:text-muted-foreground/70 hover:border-border/50 hover:bg-card/30 focus-visible:border-border focus-visible:bg-background focus-visible:ring-0";
const TABLE_HEADER_TEXT_CLASS =
  "text-3xs! font-mono font-medium uppercase tracking-wide text-muted-foreground/70";

const NEW_BREAKPOINT_ID = "__new__" as const;

interface UseCustomBreakpointsTableOptions {
  /** Reactive reference to all breakpoints (used to derive maxWidth). */
  allBreakpoints: { value: readonly UniversalBreakpointItem[] };
  /** Callback to persist a breakpoint edit. Receives the id and the form values. */
  onSaveEdit: (id: string, values: BreakpointEditForm) => Promise<void> | void;
  /** Callback to delete a breakpoint. */
  onDelete: (id: string) => Promise<void> | void;
  /** Whether a save/delete operation is in progress. */
  isSaving: { value: boolean };
}

export function useCustomBreakpointsTable(
  options: UseCustomBreakpointsTableOptions,
) {
  const { t } = useStudioI18n();
  const editingId = ref<string | null>(null);
  const editValues = ref<BreakpointEditForm>({ ...EMPTY_EDIT_FORM });

  const rows = computed<CustomBreakpointRow[]>(() => {
    const existingRows = buildCustomRows(options.allBreakpoints.value);

    // Prepend a draft row when a new breakpoint is being added
    if (editingId.value === NEW_BREAKPOINT_ID) {
      const draftRow: CustomBreakpointRow = {
        id: NEW_BREAKPOINT_ID,
        label: "",
        icon: "Monitor",
        minWidth: 0,
        canvasWidth: null,
        enabled: true,
        isDefault: false,
        order: -1,
        maxWidth: null,
      };
      return [draftRow, ...existingRows];
    }

    return existingRows;
  });

  function startEdit(row: CustomBreakpointRow): void {
    editingId.value = row.id;
    editValues.value = {
      label: row.label,
      width: String(row.canvasWidth ?? row.minWidth),
    };
  }

  function cancelEdit(): void {
    editingId.value = null;
    editValues.value = { ...EMPTY_EDIT_FORM };
  }

  async function saveEdit(row: CustomBreakpointRow): Promise<void> {
    if (!editValues.value.label.trim()) return;
    await options.onSaveEdit(row.id, { ...editValues.value });
    editingId.value = null;
  }

  function startAdd(): void {
    if (editingId.value === NEW_BREAKPOINT_ID) return;
    editingId.value = NEW_BREAKPOINT_ID;
    editValues.value = { ...EMPTY_EDIT_FORM };
  }

  function cancelAdd(): void {
    if (editingId.value !== NEW_BREAKPOINT_ID) return;
    editingId.value = null;
    editValues.value = { ...EMPTY_EDIT_FORM };
  }

  async function commitAdd(): Promise<void> {
    if (editingId.value !== NEW_BREAKPOINT_ID) return;
    if (!editValues.value.label.trim()) return;
    await options.onSaveEdit(NEW_BREAKPOINT_ID, { ...editValues.value });
    editingId.value = null;
  }

  const columns = computed<ColumnDef<CustomBreakpointRow, any>[]>(() => [
    columnHelper.accessor((row) => row.label, {
      id: "name",
      header: () =>
        h(
          "span",
          {
            class: TABLE_HEADER_TEXT_CLASS,
          },
          t("design.breakpoints.table.name"),
        ),
      cell: ({ row }) => {
        const bp = row.original;
        const isEditing = editingId.value === bp.id;
        const iconClass = getBreakpointIconClass(bp);

        if (isEditing) {
          return h("div", { class: "flex items-center gap-3" }, [
            h(
              "div",
              {
                class:
                  "size-8 rounded-lg bg-muted flex items-center justify-center shrink-0",
              },
              [
                h("span", {
                  class: `${iconClass} size-4 text-foreground`,
                }),
              ],
            ),
            h(Input, {
              modelValue: editValues.value.label,
              placeholder: t("design.breakpoints.table.breakpointName"),
              class: MINIMAL_CELL_INPUT_CLASS,
              "onUpdate:modelValue": (value: string | number) => {
                editValues.value.label = String(value);
              },
              onKeydown: (e: KeyboardEvent) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (bp.id === NEW_BREAKPOINT_ID) {
                    void commitAdd();
                  } else {
                    void saveEdit(bp);
                  }
                }
              },
            }),
          ]);
        }

        return h("div", { class: "flex items-center gap-3" }, [
          h(
            "div",
            {
              class:
                "size-8 rounded-lg bg-muted flex items-center justify-center shrink-0",
            },
            [
              h("span", {
                class: `${iconClass} size-4 text-foreground`,
              }),
            ],
          ),
          h("span", { class: "text-sm font-medium text-foreground" }, bp.label),
        ]);
      },
    }),
    columnHelper.accessor((row) => row.minWidth, {
      id: "minWidth",
      header: () =>
        h(
          "span",
          {
            class: TABLE_HEADER_TEXT_CLASS,
          },
          t("design.breakpoints.table.minWidth"),
        ),
      meta: { align: "right" },
      cell: ({ row }) => {
        const bp = row.original;
        const isEditing = editingId.value === bp.id;

        if (isEditing) {
          return h("div", { class: "flex items-center justify-end" }, [
            h(Input, {
              modelValue: editValues.value.width,
              type: "number",
              placeholder: t("design.breakpoints.table.width"),
              class: `${MINIMAL_CELL_INPUT_CLASS} w-28 text-right`,
              "onUpdate:modelValue": (value: string | number) => {
                editValues.value.width = String(value);
              },
              onKeydown: (e: KeyboardEvent) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (bp.id === NEW_BREAKPOINT_ID) {
                    void commitAdd();
                  } else {
                    void saveEdit(bp);
                  }
                }
              },
            }),
            h(
              "span",
              {
                class: "ml-1.5 text-sm text-muted-foreground select-none",
              },
              "px",
            ),
          ]);
        }

        return h(
          "div",
          { class: "flex items-center justify-end gap-1 tabular-nums" },
          [
            h(
              "span",
              { class: "text-sm font-medium text-foreground" },
              String(bp.minWidth),
            ),
            h("span", { class: "text-sm text-muted-foreground" }, "px"),
          ],
        );
      },
    }),
    columnHelper.accessor((row) => row.maxWidth, {
      id: "maxWidth",
      header: () =>
        h(
          "span",
          {
            class: TABLE_HEADER_TEXT_CLASS,
          },
          t("design.breakpoints.table.maxWidth"),
        ),
      meta: { align: "right" },
      cell: ({ row }) => {
        const mw = row.original.maxWidth;

        return h(
          "div",
          {
            class:
              "flex items-center justify-end gap-1 tabular-nums text-muted-foreground/70",
          },
          [
            mw !== null
              ? h("span", { class: "text-sm" }, String(mw))
              : h("span", { class: "text-sm" }, "∞"),
            mw !== null
              ? h("span", { class: "text-xs text-muted-foreground/50" }, "px")
              : null,
          ],
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: () =>
        h(
          "span",
          {
            class: TABLE_HEADER_TEXT_CLASS,
          },
          t("design.breakpoints.table.actions"),
        ),
      meta: { align: "right" },
      cell: ({ row }) => {
        const bp = row.original;
        const isEditing = editingId.value === bp.id;
        const isNewRow = bp.id === NEW_BREAKPOINT_ID;

        if (isEditing) {
          return h("div", { class: "flex items-center justify-end gap-1" }, [
            h(
              Button,
              {
                variant: "ghost",
                size: "icon-sm",
                disabled: options.isSaving.value,
                title: isNewRow
                  ? t("design.breakpoints.table.add")
                  : t("design.breakpoints.table.save"),
                "aria-label": isNewRow
                  ? t("design.breakpoints.table.add")
                  : t("design.breakpoints.table.save"),
                class:
                  "size-7 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10",
                onClick: () => (isNewRow ? commitAdd() : saveEdit(bp)),
              },
              {
                default: () =>
                  h("span", {
                    class: "i-hugeicons:checkmark-circle-01 size-4",
                  }),
              },
            ),
            h(
              Button,
              {
                variant: "ghost",
                size: "icon-sm",
                title: t("design.breakpoints.table.cancel"),
                "aria-label": t("design.breakpoints.table.cancel"),
                class: "size-7 text-muted-foreground hover:text-destructive",
                onClick: () => (isNewRow ? cancelAdd() : cancelEdit()),
              },
              {
                default: () =>
                  h("span", {
                    class: "i-hugeicons:cancel-01 size-4",
                  }),
              },
            ),
          ]);
        }

        return h("div", { class: "flex items-center justify-end gap-1" }, [
          h(
            Button,
            {
              variant: "ghost",
              size: "icon-sm",
              title: t("design.breakpoints.table.edit"),
              "aria-label": t("design.breakpoints.table.edit"),
              class: "size-7 text-muted-foreground/60 hover:text-foreground",
              onClick: () => startEdit(bp),
            },
            {
              default: () =>
                h("span", {
                  class: `${studioIcons.edit} size-4`,
                }),
            },
          ),
          h(
            Button,
            {
              variant: "ghost",
              size: "icon-sm",
              disabled: bp.isDefault || options.isSaving.value,
              title: t("design.breakpoints.table.delete"),
              "aria-label": t("design.breakpoints.table.delete"),
              class: "size-7 text-muted-foreground/60 hover:text-destructive",
              onClick: () => options.onDelete(bp.id),
            },
            {
              default: () =>
                h("span", {
                  class: `${studioIcons.trash} size-4`,
                }),
            },
          ),
        ]);
      },
    }),
  ]);

  const table = useVueTable({
    get data() {
      return rows.value;
    },
    get columns() {
      return columns.value;
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const headerGroups = computed(() => table.getHeaderGroups());
  const tableRows = computed(() => table.getRowModel().rows);
  const visibleColumnCount = computed(() => table.getAllColumns().length);

  function getHeadCellClass(columnId: string): string {
    const meta = table.getAllColumns().find((col) => col.id === columnId)
      ?.columnDef.meta as { align?: string } | undefined;

    const align = meta?.align === "right" ? "text-right" : "text-left";
    return `h-9 px-4 text-3xs! leading-none! ${align}`;
  }

  function getBodyCellClass(columnId: string): string {
    const meta = table.getAllColumns().find((col) => col.id === columnId)
      ?.columnDef.meta as { align?: string } | undefined;

    const align = meta?.align === "right" ? "text-right" : "text-left";
    return `px-4 py-3 ${align}`;
  }

  return {
    table,
    headerGroups,
    tableRows,
    visibleColumnCount,
    editingId,
    editValues,
    rows,
    getHeadCellClass,
    getBodyCellClass,
    startEdit,
    cancelEdit,
    saveEdit,
    startAdd,
    cancelAdd,
    commitAdd,
    isAdding: computed(() => editingId.value === NEW_BREAKPOINT_ID),
  };
}
