/**
 * UseMediaTable — TanStack Vue Table for the Studio Media list view. A fully-typed
 * TanStack table with multi-select, inline rename, sortable columns, and row context menus.
 */

import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/vue-table";
import { computed, h, ref, type Ref } from "vue";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { useTableSelection } from "@/features/Studio/core/composables/useTableSelection";
import { usePersistentTableState } from "@/features/Studio/core/composables/usePersistentTableState";
import type { InlineRenameReturn } from "@/features/Studio/core/composables/useInlineRename";
import {
  formatFileSize,
  formatUploadedAt,
  getAssetIcon,
  isFontAsset,
  getThumbnailUrl,
  isCloudflareOptimized,
  handleThumbnailError,
  splitMediaFileName,
} from "../utils";
import FontAssetPreview from "../components/FontAssetPreview.vue";
import type { MediaAsset } from "../types/media";
import { useStudioI18n } from "@/i18n";

export interface MediaFolderGroupingRefs {
  assignments: Ref<Record<string, string>>;
  groups: Ref<readonly { id: string; name: string }[]>;
}

function resolveAssetFolderLabel(
  assetId: string,
  grouping: MediaFolderGroupingRefs,
): string {
  const groupId = grouping.assignments.value[assetId];
  if (!groupId) {
    return "";
  }
  return (
    grouping.groups.value.find((group) => group.id === groupId)?.name ?? ""
  );
}

const columnHelper = createColumnHelper<MediaAsset>();

const SORTING_KEY = "aria:media:table-sorting";
const PICKER_SORTING_KEY = "aria:media-picker:table-sorting";
const VISIBILITY_KEY = "aria:media:table-columns";
const COLUMN_ORDER_KEY = "aria:media:table-column-order";

export type UseMediaTableLibraryOptions = {
  mode?: "library";
  data: Ref<MediaAsset[]>;
  inlineRename?: InlineRenameReturn<string>;
  grouping?: MediaFolderGroupingRefs;
};

export type UseMediaTablePickerOptions = {
  mode: "picker";
  data: Ref<MediaAsset[]>;
};

export type UseMediaTableOptions =
  | UseMediaTableLibraryOptions
  | UseMediaTablePickerOptions;

export interface UseMediaTableReturn {
  table: ReturnType<typeof useVueTable<MediaAsset>>;
  rowSelection: Ref<RowSelectionState>;
}

function createCoverColumn(
  t: ReturnType<typeof useStudioI18n>["t"],
  options: { enableHiding?: boolean } = {},
): ColumnDef<MediaAsset> {
  return columnHelper.display({
    id: "cover",
    header: t("media.thumbnail"),
    size: 96,
    meta: { studioTableWidthMode: "fixed" },
    enableHiding: options.enableHiding ?? true,
    enableSorting: false,
    cell: ({ row }) => {
      const asset = row.original;

      if (asset.type === "image" || asset.type === "icon") {
        return h("img", {
          src: getThumbnailUrl(asset),
          alt: asset.name,
          draggable: false,
          class:
            asset.type === "icon"
              ? "w-16 h-12 rounded-md bg-card/30 object-contain p-2"
              : "w-16 h-12 object-cover rounded-md",
          onError: (e: Event) => handleThumbnailError(e, asset),
        });
      }

      if (isFontAsset(asset)) {
        return h(
          "div",
          {
            class:
              "flex h-12 w-16 items-center justify-center overflow-hidden rounded-md bg-card/30",
          },
          [h(FontAssetPreview, { asset, size: "list" })],
        );
      }

      return h(
        "div",
        {
          class:
            "flex h-12 w-16 items-center justify-center rounded-md bg-card/30",
        },
        [
          h("span", {
            class: `${getAssetIcon(asset.type)} size-4 text-muted-foreground/40`,
          }),
        ],
      );
    },
  });
}

function createNameColumn(options: {
  inlineRename?: InlineRenameReturn<string>;
  readOnly: boolean;
  t: ReturnType<typeof useStudioI18n>["t"];
}): ColumnDef<MediaAsset> {
  return columnHelper.accessor((row) => row.name, {
    id: "name",
    minSize: 280,
    meta: { studioTableWidthMode: "flex" },
    header: options.t("media.name"),
    cell: ({ row }) => {
      const asset = row.original;
      const { extension } = splitMediaFileName(asset.name);
      const isEditing =
        !options.readOnly &&
        options.inlineRename &&
        options.inlineRename.editingId.value === asset.id;

      return h("div", { class: "flex min-w-0 items-center gap-2" }, [
        isEditing && options.inlineRename
          ? h(
              "div",
              {
                class: "flex min-w-0 items-center gap-0.5",
                onClick: (e: Event) => e.stopPropagation(),
                onDblclick: (e: Event) => e.stopPropagation(),
              },
              [
                h("input", {
                  ref: options.inlineRename.inputRef,
                  value: options.inlineRename.editingValue.value,
                  onInput: (e: Event) => {
                    const target = e.target;
                    if (target instanceof HTMLInputElement) {
                      options.inlineRename!.editingValue.value = target.value;
                    }
                  },
                  class:
                    "h-auto min-w-[10ch] border-none bg-transparent p-0 text-sm font-medium tracking-wide text-foreground outline-none",
                  onKeydown: options.inlineRename.handleRenameKeydown,
                  onClick: (e: Event) => e.stopPropagation(),
                  onDblclick: (e: Event) => e.stopPropagation(),
                  onMousedown: (e: Event) => e.stopPropagation(),
                }),
                extension
                  ? h(
                      "span",
                      {
                        class:
                          "shrink-0 text-sm font-mono text-muted-foreground",
                      },
                      extension,
                    )
                  : null,
                h(
                  Button,
                  {
                    variant: "ghost",
                    size: "icon-sm",
                    class: "size-4 p-0 text-emerald-500 hover:text-emerald-600",
                    onClick: (e: Event) => {
                      e.stopPropagation();
                      void options.inlineRename!.confirmRename();
                    },
                  },
                  {
                    default: () =>
                      h("span", {
                        class: `${studioIcons.check} size-3.5`,
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
                    onClick: (e: Event) => {
                      e.stopPropagation();
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
              ],
            )
          : h(
              "span",
              {
                class:
                  "min-w-0 flex-1 truncate text-sm font-medium tracking-wide text-foreground",
              },
              asset.name,
            ),
        isCloudflareOptimized(asset)
          ? h(
              "div",
              {
                class:
                  "inline-flex shrink-0 items-center gap-1 rounded-sm border border-dashed border-border bg-sidebar px-1.5 py-0.5",
              },
              [
                h("span", {
                  class: `${studioIcons.globe} size-3 text-muted-foreground`,
                  "aria-hidden": true,
                }),
                h(
                  "span",
                  {
                    class:
                      "text-[9px] uppercase tracking-wide text-muted-foreground",
                  },
                  options.t("media.optimized"),
                ),
              ],
            )
          : null,
      ]);
    },
  }) as ColumnDef<MediaAsset>;
}

function createFolderColumn(
  grouping: MediaFolderGroupingRefs,
  t: ReturnType<typeof useStudioI18n>["t"],
): ColumnDef<MediaAsset> {
  return columnHelper.accessor(
    (row) => resolveAssetFolderLabel(row.id, grouping),
    {
      id: "folder",
      minSize: 88,
      size: 88,
      meta: { studioTableWidthMode: "min" },
      header: t("media.folder"),
      cell: ({ getValue }) => {
        const label = getValue();
        if (!label) {
          return h("span", { class: "text-2xs text-muted-foreground/40" }, "—");
        }

        return h(
          "span",
          {
            class: "text-2xs text-muted-foreground truncate",
            title: label,
          },
          label,
        );
      },
      sortingFn: (rowA, rowB) =>
        resolveAssetFolderLabel(rowA.original.id, grouping).localeCompare(
          resolveAssetFolderLabel(rowB.original.id, grouping),
        ),
    },
  ) as ColumnDef<MediaAsset>;
}

function localizedAssetTypeLabel(
  asset: MediaAsset,
  t: ReturnType<typeof useStudioI18n>["t"],
): string {
  if (isFontAsset(asset)) return t("media.assetType.font");
  if (asset.type === "image") return t("media.assetType.image");
  if (asset.type === "video") return t("media.assetType.video");
  if (asset.type === "icon") return t("media.assetType.icon");
  return t("media.assetType.file");
}

function createTypeColumn(
  t: ReturnType<typeof useStudioI18n>["t"],
): ColumnDef<MediaAsset> {
  return columnHelper.accessor((row) => localizedAssetTypeLabel(row, t), {
    id: "type",
    minSize: 96,
    size: 96,
    meta: { studioTableWidthMode: "min" },
    header: t("media.type"),
    cell: ({ getValue }) =>
      h("span", { class: "text-2xs text-muted-foreground" }, getValue()),
  }) as ColumnDef<MediaAsset>;
}

function createSizeColumn(
  t: ReturnType<typeof useStudioI18n>["t"],
): ColumnDef<MediaAsset> {
  return columnHelper.accessor((row) => row.size, {
    id: "size",
    minSize: 80,
    size: 80,
    meta: { studioTableWidthMode: "min" },
    header: t("media.size"),
    cell: ({ getValue }) =>
      h(
        "span",
        { class: "text-2xs text-muted-foreground tabular-nums" },
        formatFileSize(getValue()),
      ),
    sortingFn: "basic",
  }) as ColumnDef<MediaAsset>;
}

function createCropsColumn(
  t: ReturnType<typeof useStudioI18n>["t"],
): ColumnDef<MediaAsset> {
  return columnHelper.accessor((row) => row.cropCount ?? 0, {
    id: "crops",
    minSize: 72,
    size: 72,
    meta: { studioTableWidthMode: "min" },
    header: t("media.crops"),
    cell: ({ getValue, row }) => {
      if (row.original.type !== "image") {
        return h("span", { class: "text-2xs text-muted-foreground/40" }, "—");
      }

      const count = getValue();
      return h(
        "span",
        {
          class:
            count > 0
              ? "inline-flex min-w-6 justify-center rounded-sm border border-border/60 bg-muted/30 px-1.5 py-0.5 text-2xs font-medium tabular-nums text-foreground"
              : "text-2xs tabular-nums text-muted-foreground/50",
        },
        String(count),
      );
    },
    sortingFn: "basic",
  }) as ColumnDef<MediaAsset>;
}

function createUploadedColumn(
  t: ReturnType<typeof useStudioI18n>["t"],
): ColumnDef<MediaAsset> {
  return columnHelper.accessor((row) => row.uploadedAt ?? "", {
    id: "uploaded",
    minSize: 120,
    size: 120,
    meta: { studioTableWidthMode: "min" },
    header: t("media.uploaded"),
    cell: ({ getValue }) =>
      h(
        "span",
        { class: "text-2xs text-muted-foreground tabular-nums" },
        formatUploadedAt(getValue()),
      ),
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.uploadedAt ?? "";
      const b = rowB.original.uploadedAt ?? "";
      return a.localeCompare(b);
    },
  }) as ColumnDef<MediaAsset>;
}

function buildPickerColumns(
  t: ReturnType<typeof useStudioI18n>["t"],
): ColumnDef<MediaAsset>[] {
  return [
    createCoverColumn(t, { enableHiding: false }),
    createNameColumn({ readOnly: true, t }),
    createTypeColumn(t),
    createSizeColumn(t),
    createUploadedColumn(t),
  ];
}

function buildLibraryColumns(
  options: UseMediaTableLibraryOptions,
  createSelectColumn: () => ColumnDef<MediaAsset>,
  t: ReturnType<typeof useStudioI18n>["t"],
): ColumnDef<MediaAsset>[] {
  const columns: ColumnDef<MediaAsset>[] = [
    createSelectColumn(),
    createCoverColumn(t),
    createNameColumn({
      inlineRename: options.inlineRename,
      readOnly: false,
      t,
    }),
    createTypeColumn(t),
  ];

  if (options.grouping) {
    void options.grouping.assignments.value;
    void options.grouping.groups.value;
    columns.push(createFolderColumn(options.grouping, t));
  }

  columns.push(
    createCropsColumn(t),
    createSizeColumn(t),
    createUploadedColumn(t),
  );

  return columns;
}

export function useMediaTable(
  options: UseMediaTableOptions,
): UseMediaTableReturn {
  const { t } = useStudioI18n();
  const isPickerMode = options.mode === "picker";
  const sortingKey = isPickerMode ? PICKER_SORTING_KEY : SORTING_KEY;
  const librarySelection = isPickerMode ? null : useTableSelection();
  const pickerRowSelection = ref<RowSelectionState>({});
  const rowSelection = librarySelection?.rowSelection ?? pickerRowSelection;
  const {
    sorting,
    columnVisibility,
    columnOrder,
    onSortingChange,
    onColumnVisibilityChange,
    onColumnOrderChange,
  } = usePersistentTableState({
    sorting: {
      key: sortingKey,
      defaultValue: [],
    },
    visibility: {
      key: isPickerMode ? undefined : VISIBILITY_KEY,
      defaultValue: isPickerMode ? {} : { cover: false, crops: false },
      normalizeLoadedState: (state) =>
        isPickerMode ? state : { crops: false, ...state },
      normalizeUpdatedState: (state) => ({
        crops: false,
        ...state,
        name: true,
      }),
    },
    columnOrder: {
      key: isPickerMode ? undefined : COLUMN_ORDER_KEY,
      defaultValue: [],
    },
  });

  const columns = computed<ColumnDef<MediaAsset>[]>(() => {
    if (isPickerMode) {
      return buildPickerColumns(t);
    }

    return buildLibraryColumns(
      options,
      () => librarySelection!.createSelectColumn<MediaAsset>(),
      t,
    );
  });

  const table = useVueTable<MediaAsset>({
    get data() {
      return options.data.value;
    },
    get columns() {
      return columns.value;
    },
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      get rowSelection() {
        return rowSelection.value;
      },
      get sorting() {
        return sorting.value;
      },
      get columnVisibility() {
        return columnVisibility.value;
      },
      get columnOrder() {
        return columnOrder.value;
      },
    },
    enableRowSelection: !isPickerMode,
    onRowSelectionChange: (updater) => {
      rowSelection.value =
        typeof updater === "function" ? updater(rowSelection.value) : updater;
    },
    onSortingChange,
    onColumnVisibilityChange: isPickerMode
      ? undefined
      : onColumnVisibilityChange,
    onColumnOrderChange: isPickerMode ? undefined : onColumnOrderChange,
  });

  return { table, rowSelection };
}
