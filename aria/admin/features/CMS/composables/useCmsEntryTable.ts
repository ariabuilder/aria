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
import { CHECKERBOARD_STYLE } from "@/components/ui/color-picker/checkerboard";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import type { CmsEntryRow } from "../lib/entryRow";
import type { EntryStatus } from "../../../../lib/cms/constants";
import type { FieldSchema } from "../../../../lib/cms/schemas";
import CmsEntryCoverThumb from "../components/CmsEntryCoverThumb";
import CmsCollectionIconPreview from "../components/CmsCollectionIconPreview.vue";
import { useTableSelection } from "@/features/Studio/core/composables/useTableSelection";
import { usePersistentTableState } from "@/features/Studio/core/composables/usePersistentTableState";
import {
  formatEntryListFieldValue,
  isEntryListDisplayField,
} from "../lib/entryListField";
import { isCmsColorField } from "../lib/colorField";
import { resolveTargetCollectionId } from "../lib/resolveEntryLabels";
import { fetchEntryList } from "./useCmsDataCache";
import { useStudioI18n } from "@/i18n";

const columnHelper = createColumnHelper<CmsEntryRow>();
const VISIBILITY_KEY = "aria:cms:entries:table-columns";
const SORTING_KEY = "aria:cms:entries:table-sorting";
const COLUMN_ORDER_KEY = "aria:cms:entries:table-column-order";
const REQUIRED_VISIBLE_COLUMNS = ["title"] as const;
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
  .catch([{ id: "updatedAt", desc: true }]);
const ColumnOrderStateSchema = z.array(z.string().trim().min(1)).catch([]);

function ensureEntryVisibility(state: VisibilityState): VisibilityState {
  return REQUIRED_VISIBLE_COLUMNS.reduce<VisibilityState>(
    (next, columnId) => ({ ...next, [columnId]: true }),
    { ...state },
  );
}

export interface UseCmsEntryTableOptions {
  data: Ref<CmsEntryRow[]>;
  fields: Ref<readonly FieldSchema[]>;
  supportsCover?: Ref<boolean>;
}

function statusLabel(
  status: EntryStatus,
  t: ReturnType<typeof useStudioI18n>["t"],
): string {
  switch (status) {
    case "draft":
      return t("pages.status.draft");
    case "published":
      return t("pages.status.published");
    case "scheduled":
      return t("pages.status.scheduled");
    case "archived":
      return t("pages.status.archived");
    default:
      return status;
  }
}

function statusVariant(
  status: EntryStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "published":
      return "default";
    case "scheduled":
      return "secondary";
    case "archived":
      return "outline";
    case "draft":
    default:
      return "secondary";
  }
}

function entryListFieldColumnWidth(field: FieldSchema): {
  minSize: number;
  size: number;
} {
  if (isCmsColorField(field)) {
    return { minSize: 68, size: 76 };
  }

  switch (field.type) {
    case "icon":
      return { minSize: 56, size: 64 };
    case "date":
      return { minSize: 152, size: 160 };
    case "datetime":
      return { minSize: 180, size: 192 };
    default:
      return { minSize: 132, size: 144 };
  }
}

function renderColorBadge(value: unknown, title: string) {
  const color = typeof value === "string" ? value.trim() : "";

  if (!color) {
    return h(
      "span",
      {
        class:
          "inline-flex h-6 w-10 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20 text-[10px] text-muted-foreground/50",
        title,
        "aria-label": "No color selected",
      },
      "—",
    );
  }

  return h(
    "span",
    {
      class:
        "inline-flex h-6 w-10 overflow-hidden rounded-md border border-border/60 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]",
      title: color,
      "aria-label": `Color ${color}`,
      style: { background: CHECKERBOARD_STYLE },
    },
    [
      h("span", {
        class: "block size-full",
        style: { backgroundColor: color },
      }),
    ],
  );
}

export function useCmsEntryTable(options: UseCmsEntryTableOptions) {
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
      defaultValue: () => ensureEntryVisibility({ cover: false }),
      parse: (value) => VisibilityStateSchema.parse(value),
      normalizeLoadedState: (state) =>
        ensureEntryVisibility({
          cover: false,
          ...state,
        }),
      normalizeUpdatedState: ensureEntryVisibility,
      persistLoadedState: true,
    },
    sorting: {
      key: SORTING_KEY,
      defaultValue: [{ id: "updatedAt", desc: true }],
      parse: (value) => SortingStateSchema.parse(value),
    },
    columnOrder: {
      key: COLUMN_ORDER_KEY,
      defaultValue: [],
      parse: (value) => ColumnOrderStateSchema.parse(value),
    },
  });
  const columnSizing = ref<ColumnSizingState>({});
  const referenceLabels = ref<Record<string, Record<string, string>>>({});

  const supportsCover = computed(() => options.supportsCover?.value ?? true);
  const columns = computed(() => [
    createSelectColumn<CmsEntryRow>(),
    ...(supportsCover.value
      ? [
          columnHelper.accessor((row) => row.frontmatter, {
            id: "cover",
            header: t("cms.entries.column.cover"),
            size: 76,
            meta: { studioTableWidthMode: "fixed" },
            enableSorting: false,
            cell: ({ row }) =>
              h(CmsEntryCoverThumb, {
                frontmatter: row.original.frontmatter,
                title: row.original.title,
                variant: "table",
                coverSupported: true,
              }),
          }),
        ]
      : []),
    columnHelper.accessor((row) => row.title, {
      id: "title",
      minSize: 360,
      size: 380,
      enableHiding: false,
      meta: { studioTableWidthMode: "min" },
      header: t("cms.entries.column.title"),
      cell: ({ row }) =>
        h(
          "span",
          {
            class: "block truncate text-sm font-semibold text-foreground",
          },
          row.original.title || t("cms.entries.untitled"),
        ),
    }),
    columnHelper.accessor((row) => row.slug, {
      id: "slug",
      minSize: 176,
      size: 176,
      meta: { studioTableWidthMode: "min" },
      header: t("cms.entries.column.slug"),
      cell: ({ row }) =>
        h(
          "span",
          {
            class:
              "block max-w-full truncate font-mono text-xs text-muted-foreground/60 tabular-nums",
          },
          row.original.slug,
        ),
    }),
    columnHelper.accessor((row) => row.locale, {
      id: "locale",
      size: 72,
      meta: { studioTableWidthMode: "fixed" },
      header: t("cms.entries.column.locale"),
      cell: ({ row }) =>
        h(
          "span",
          { class: "text-xs text-muted-foreground/60 tabular-nums" },
          row.original.locale,
        ),
    }),
    columnHelper.accessor((row) => row.status, {
      id: "status",
      size: 104,
      meta: { studioTableWidthMode: "fixed" },
      header: t("cms.entries.column.status"),
      cell: ({ row }) =>
        h(
          Badge,
          {
            variant: statusVariant(row.original.status),
            class: "h-6 px-2 text-[11px] capitalize",
          },
          () => statusLabel(row.original.status, t),
        ),
    }),
    columnHelper.accessor((row) => row.updatedAt, {
      id: "updatedAt",
      size: 104,
      meta: { studioTableWidthMode: "fixed" },
      header: t("cms.entries.column.updated"),
      cell: ({ row }) =>
        h(
          "span",
          {
            class: "text-xs text-muted-foreground",
          },
          formatRelativeTime(row.original.updatedAt),
        ),
    }),
    columnHelper.accessor((row) => row.publishedAt, {
      id: "publishedAt",
      size: 112,
      meta: { studioTableWidthMode: "fixed" },
      header: t("cms.entries.column.published"),
      cell: ({ row }) =>
        h(
          "span",
          { class: "text-xs text-muted-foreground" },
          row.original.publishedAt
            ? formatRelativeTime(row.original.publishedAt)
            : "—",
        ),
    }),
    ...options.fields.value
      .filter(isEntryListDisplayField)
      .map((field) => {
        const width = entryListFieldColumnWidth(field);
        return columnHelper.accessor((row) => row.frontmatter[field.key], {
          id: `field:${field.key}`,
          minSize: width.minSize,
          size: width.size,
          enableSorting: false,
          meta: {
            studioTableWidthMode:
              field.type === "icon" || isCmsColorField(field) ? "fixed" : "min",
          },
          header: field.label,
          cell: ({ row }) => {
            const value = row.original.frontmatter[field.key];
            const formatted =
              field.type === "reference" && typeof value === "string"
                ? referenceLabels.value[field.key]?.[value] ??
                  formatEntryListFieldValue(value)
                : formatEntryListFieldValue(value);
            if (field.type === "icon" && typeof value === "string" && value.trim()) {
              return h(
                "span",
                {
                  class:
                    "inline-grid size-8 place-items-center rounded-sm text-muted-foreground/70",
                  title: formatted,
                },
                h(CmsCollectionIconPreview, {
                  value,
                  class: "size-5",
                }),
              );
            }
            if (isCmsColorField(field)) {
              return renderColorBadge(value, formatted);
            }
            return h(
              "span",
              {
                class:
                  "block max-w-full truncate text-xs text-muted-foreground/70",
              },
              formatted,
            );
          },
        });
      }),
  ]);

  watch(
    [() => options.fields.value, () => options.data.value],
    async () => {
      const referenceFields = options.fields.value.filter(
        (field) =>
          field.type === "reference" &&
          isEntryListDisplayField(field) &&
          Boolean(field.targetCollection?.trim()),
      );
      if (referenceFields.length === 0 || options.data.value.length === 0) {
        referenceLabels.value = {};
        return;
      }

      const nextLabels: Record<string, Record<string, string>> = {};

      await Promise.all(
        referenceFields.map(async (field) => {
          const ids = new Set(
            options.data.value
              .map((row) => row.frontmatter[field.key])
              .filter((value): value is string => typeof value === "string"),
          );
          if (ids.size === 0 || !field.targetCollection) {
            return;
          }

          try {
            const collectionId = await resolveTargetCollectionId(
              field.targetCollection,
            );
            const data = await fetchEntryList({
              collectionId,
              page: 1,
              limit: 100,
            });
            nextLabels[field.key] = Object.fromEntries(
              data.items
                .map((record) => {
                  const locale =
                    record.locales.find((candidate) => candidate.isSource) ??
                    record.locales[0];
                  return locale && ids.has(record.entry.id)
                    ? [record.entry.id, locale.title]
                    : null;
                })
                .filter((entry): entry is [string, string] => entry !== null),
            );
          } catch {
            nextLabels[field.key] = {};
          }
        }),
      );

      referenceLabels.value = nextLabels;
    },
    { immediate: true },
  );

  watch(
    columnVisibility,
    (visibility) => {
      const next = ensureEntryVisibility(visibility);
      if (JSON.stringify(next) !== JSON.stringify(visibility)) {
        setColumnVisibility(next);
      }
    },
    { immediate: true },
  );

  const table = useVueTable<CmsEntryRow>({
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
    onRowSelectionChange: (updater) => {
      rowSelection.value =
        typeof updater === "function" ? updater(rowSelection.value) : updater;
    },
    onColumnSizingChange: (updater) => {
      columnSizing.value =
        typeof updater === "function" ? updater(columnSizing.value) : updater;
    },
    onColumnOrderChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return { table, sorting, columnVisibility, rowSelection };
}
