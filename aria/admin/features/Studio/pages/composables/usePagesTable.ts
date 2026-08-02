import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type ColumnDef,
} from "@tanstack/vue-table";
import { computed, h, watch } from "vue";
import { studioIcons } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InlineRenameReturn } from "@/features/Studio/core/composables/useInlineRename";
import { useTableSelection } from "@/features/Studio/core/composables/useTableSelection";
import { usePersistentTableState } from "@/features/Studio/core/composables/usePersistentTableState";
import type { Ref } from "vue";
import type { PageTreeNode } from "./usePagesListState";
import { formatRelativeTime } from "@/features/Core/utils/formatting";
import { formatCompactCount } from "@/lib/metrics/format";
import TrafficSparkline from "@/features/Studio/metrics/components/TrafficSparkline.vue";
import {
  cmsPageUsageBadgeLabels,
  type CmsPageUsage,
} from "../../../../../lib/cms/pageUsage";
import { useStudioI18n } from "@/i18n";

const VISIBILITY_KEY = "aria:pages:table-columns";
const SORTING_KEY = "aria:pages:table-sorting";
const COLUMN_ORDER_KEY = "aria:pages:table-column-order";

const columnHelper = createColumnHelper<PageTreeNode>();

function isModified(status: string, dirty: boolean): boolean {
  return status === "published" && dirty;
}

function formatUpdatedCell(page: PageTreeNode["page"]): string {
  return page.updatedAt ? formatRelativeTime(page.updatedAt) : "—";
}

function formatAccess(
  mode: "public" | "password" | "private" | "unlisted" | undefined,
  t: ReturnType<typeof useStudioI18n>["t"],
): string {
  if (!mode || mode === "public") return t("pages.access.public");
  if (mode === "password") return t("pages.access.password");
  if (mode === "private") return t("pages.access.private");
  return t("pages.access.unlisted");
}

function formatStatus(
  status: PageTreeNode["page"]["status"],
  t: ReturnType<typeof useStudioI18n>["t"],
): string {
  switch (status) {
    case "published":
      return t("pages.status.published");
    case "draft":
      return t("pages.status.draft");
    case "scheduled":
      return t("pages.status.scheduled");
    default:
      return t("pages.status.archived");
  }
}

function getPageRowIcon(page: PageTreeNode["page"]): string {
  if (page.slug === "index") return studioIcons.security;
  if (page.systemRole === "not-found") return studioIcons.pageSpecial;
  if (page.systemRole === "cms-collection") return studioIcons.designLayout;
  if (page.systemRole === "cms-entry") return studioIcons.designLayout;
  if (page.parent) return studioIcons.pageChild;
  return studioIcons.page;
}

function getPageRowIconClass(page: PageTreeNode["page"]): string {
  const color =
    page.slug === "index" ? "text-primary/90" : "text-muted-foreground/40";
  return `${getPageRowIcon(page)} size-4.5 ${color}`;
}

export interface UsePagesTableOptions {
  data: { value: PageTreeNode[] };
  layoutMap: { value: Map<string, string> };
  /** Inline rename state from useInlineRename. Omit to disable inline rename. */
  inlineRename?: InlineRenameReturn<string>;
  visitsBySlug?: Ref<Record<string, number>>;
  showVisitsColumn?: Ref<boolean>;
  trafficSparklineForSlug?: (slug: string) => readonly number[];
  showTrafficColumn?: Ref<boolean>;
  pageUsagesById?: Ref<ReadonlyMap<string, readonly CmsPageUsage[]>>;
}

export function usePagesTable(options: UsePagesTableOptions) {
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
      defaultValue: { cover: false, visits: false, traffic: false },
      normalizeUpdatedState: (state) => ({ ...state, page: true }),
    },
    sorting: {
      key: SORTING_KEY,
      defaultValue: [],
    },
    columnOrder: {
      key: COLUMN_ORDER_KEY,
      defaultValue: [],
    },
  });
  const columns = computed(() => [
    createSelectColumn<PageTreeNode>() as ColumnDef<PageTreeNode, unknown>,
    columnHelper.accessor((row) => row.page.featuredImage?.src, {
      id: "cover",
      header: t("pages.column.cover"),
      size: 96,
      meta: { studioTableWidthMode: "fixed" },
      cell: ({ row }) => {
        const featuredImage = row.original.page.featuredImage;
        return featuredImage?.src
          ? h("img", {
              src: featuredImage.src,
              alt: featuredImage.alt ?? "",
              class: "w-16 h-12 object-cover rounded-md",
            })
          : h(
              "div",
              {
                class:
                  "w-16 h-12 rounded-md bg-card/30 flex items-center justify-center",
              },
              [
                h("span", {
                  class: `${studioIcons.image} size-4 text-muted-foreground/40`,
                }),
              ],
            );
      },
    }),
    columnHelper.accessor((row) => row.page.title, {
      id: "page",
      minSize: 280,
      meta: { studioTableWidthMode: "flex" },
      header: t("pages.column.page"),
      cell: ({ row }) => {
        const node = row.original;
        return h("div", { class: "flex items-center gap-2 min-w-0" }, [
          node.depth > 0
            ? h("div", {
                style: { width: `${node.depth * 14}px` },
                class: "shrink-0",
              })
            : null,
          h(
            "span",
            {
              class: `size-5 rounded shrink-0 flex items-center justify-center ${node.page.slug === "index" ? "bg-transparent" : "bg-transparent"}`,
            },
            [
              h("span", {
                class: getPageRowIconClass(node.page),
              }),
            ],
          ),
          options.inlineRename &&
          options.inlineRename.editingId.value === node.page.slug
            ? h("div", { class: "flex items-center gap-0.5 min-w-0" }, [
                h("input", {
                  ref: options.inlineRename.inputRef,
                  value: options.inlineRename.editingValue.value,
                  onInput: (e: Event) => {
                    options.inlineRename!.editingValue.value = (
                      e.target as HTMLInputElement
                    ).value;
                  },
                  class:
                    "h-auto bg-transparent text-sm font-medium text-foreground outline-none border-none p-0 min-w-[8ch]",
                  onKeydown: options.inlineRename.handleRenameKeydown,
                  onClick: (e: Event) => e.stopPropagation(),
                }),
                h(
                  Button,
                  {
                    variant: "headerAction",
                    size: "icon-header",
                    class: "p-0 text-primary/90 hover:text-primary/80 s",
                    onClick: (e: Event) => {
                      e.stopPropagation();
                      void options.inlineRename!.confirmRename();
                    },
                  },
                  {
                    default: () =>
                      h("span", {
                        class: `${studioIcons.published} size-3.5`,
                      }),
                  },
                ),
                h(
                  Button,
                  {
                    variant: "headerAction",
                    size: "icon-header",
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
              ])
            : h("div", { class: "flex items-center gap-1.5 min-w-0" }, [
                h(
                  "span",
                  {
                    class:
                      "text-sm font-medium capitalize truncate min-w-0 flex-1",
                  },
                  node.page.title,
                ),
                isModified(node.page.status, node.page.isModifiedSincePublish)
                  ? h(
                      Badge,
                      {
                        variant: "modified",
                        size: "sm",
                        class: "ml-3 shrink-0 ",
                      },
                      { default: () => t("pages.status.modified") },
                    )
                  : null,
                ...cmsPageUsageBadgeLabels(
                  options.pageUsagesById?.value.get(node.page.id),
                ).map((label) =>
                  h(
                    Badge,
                    {
                      variant: "outline",
                      size: "sm",
                      class:
                        "ml-1 shrink-0 border-primary/25 bg-primary/8 text-primary",
                    },
                    { default: () => label },
                  ),
                ),
              ]),
        ]);
      },
    }),
    columnHelper.accessor((row) => row.page.slug, {
      id: "slug",
      minSize: 240,
      size: 240,
      meta: { studioTableWidthMode: "min" },
      header: t("pages.column.slug"),
      cell: ({ row }) =>
        h(
          "span",
          {
            class:
              "block max-w-full truncate text-xs font-mono text-muted-foreground/50 tabular-nums",
          },
          row.original.path,
        ),
    }),
    columnHelper.accessor((row) => row.page.description ?? "", {
      id: "description",
      minSize: 220,
      size: 220,
      meta: { studioTableWidthMode: "min" },
      header: t("pages.column.description"),
      cell: ({ row }) => {
        const text = row.original.page.description?.trim();
        return h(
          "span",
          {
            class:
              "block max-w-full truncate text-xs text-muted-foreground/50",
            title: text || undefined,
          },
          text || "—",
        );
      },
    }),
    columnHelper.accessor((row) => row.page.layout, {
      id: "layout",
      minSize: 152,
      size: 152,
      meta: { studioTableWidthMode: "min" },
      header: t("pages.column.layout"),
      cell: ({ row }) => {
        const layoutName =
          options.layoutMap.value.get(row.original.page.layout) ??
          row.original.page.layout ??
          "—";
        return h(
          "span",
          {
            class:
              "block max-w-full truncate text-xs text-muted-foreground/50 tabular-nums",
          },
          layoutName,
        );
      },
    }),
    columnHelper.accessor((row) => row.page.accessMode, {
      id: "access",
      minSize: 132,
      size: 132,
      meta: { studioTableWidthMode: "min" },
      header: t("pages.column.access"),
      cell: ({ row }) => {
        const page = row.original.page;
        return h("div", { class: "flex items-left gap-1" }, [
          page.hasPassword
            ? h("span", {
                class: `${studioIcons.lock} size-3 text-muted-foreground`,
              })
            : null,
          h(
            "span",
            { class: "text-xs text-muted-foreground/50 tabular-nums" },
            formatAccess(page.accessMode, t),
          ),
        ]);
      },
    }),
    ...(options.showVisitsColumn?.value && options.visitsBySlug
      ? [
          columnHelper.accessor(
            (row) => options.visitsBySlug!.value[row.page.slug] ?? 0,
            {
              id: "visits",
              minSize: 96,
              size: 96,
              meta: { studioTableWidthMode: "min" },
              header: t("pages.column.visits"),
              enableSorting: true,
              sortingFn: (rowA, rowB) => {
                const av =
                  options.visitsBySlug!.value[rowA.original.page.slug] ?? 0;
                const bv =
                  options.visitsBySlug!.value[rowB.original.page.slug] ?? 0;
                if (bv !== av) return bv - av;
                return (rowA.original.page.title || "").localeCompare(
                  rowB.original.page.title || "",
                );
              },
              cell: ({ row }) =>
                h(
                  "span",
                  {
                    class:
                      "text-xs text-muted-foreground/70 tabular-nums font-mono",
                  },
                  formatCompactCount(
                    options.visitsBySlug!.value[row.original.page.slug] ?? 0,
                  ),
                ),
            },
          ),
        ]
      : []),
    ...(options.showTrafficColumn?.value && options.trafficSparklineForSlug
      ? [
          columnHelper.display({
            id: "traffic",
            minSize: 112,
            size: 112,
            meta: { studioTableWidthMode: "min" },
            header: t("pages.column.traffic"),
            cell: ({ row }) => {
              const values = options.trafficSparklineForSlug!(
                row.original.page.slug,
              );

              return values.length > 0
                ? h(
                    "div",
                    { class: "flex h-5 items-center" },
                    [
                      h(TrafficSparkline, {
                        values,
                        width: 72,
                        height: 20,
                      }),
                    ],
                  )
                : h(
                    "span",
                    { class: "text-xs text-muted-foreground/50" },
                    "—",
                  );
            },
          }),
        ]
      : []),
    columnHelper.accessor((row) => row.page.updatedAt, {
      id: "updated",
      minSize: 120,
      size: 120,
      meta: { studioTableWidthMode: "min" },
      header: t("pages.column.updated"),
      cell: ({ row }) =>
        h(
          "span",
          { class: "text-xs text-muted-foreground/50 tabular-nums" },
          formatUpdatedCell(row.original.page),
        ),
    }),
    columnHelper.accessor((row) => row.page.status, {
      id: "status",
      minSize: 144,
      size: 144,
      meta: { studioTableWidthMode: "min" },
      header: t("pages.column.status"),
      cell: ({ row }) => {
        const status = row.original.page.status;
        return h("div", { class: "flex items-center gap-2" }, [
          h("span", {
            class: `size-1.5 rounded-full shrink-0 ${
              status === "published"
                ? "bg-emerald-500"
                : status === "scheduled"
                  ? "bg-sky-500"
                : status === "draft"
                  ? "bg-amber-500"
                  : "bg-muted-foreground/30"
            }`,
          }),
          h(
            "span",
            { class: "text-xs capitalize text-muted-foreground/70" },
            formatStatus(status, t),
          ),
        ]);
      },
    }),
  ] as ColumnDef<PageTreeNode, unknown>[]);

  watch(
    () => options.showVisitsColumn?.value,
    (enabled) => {
      if (enabled) {
        setColumnVisibility({
          ...columnVisibility.value,
          visits: true,
        });
      }
    },
    { immediate: true },
  );

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

  return { table, rowSelection, columnVisibility };
}
