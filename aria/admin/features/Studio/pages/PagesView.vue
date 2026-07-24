<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onActivated,
  onUnmounted,
} from "vue";
import { actions as serverActions } from "astro:actions";
import { useRoute } from "vue-router";
import { useStudioI18n } from "@/i18n";

// Explicit name is consumed by `<KeepAlive include="PagesView,...">` in
// StudioApp.vue so cross-tab navigation reuses this view's component
// instance (preserving thumbnail blob URLs, scroll, in-memory filters).
defineOptions({ name: "PagesView" });
import { FlexRender } from "@tanstack/vue-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { studioIcons } from "@/lib/icons";
import { useStudioActions } from "@/features/Studio/composer/composables/useStudioActions";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import FilterIconMenu from "@/features/Studio/core/components/FilterIconMenu.vue";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import HeaderActionDropdownTooltip from "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useBuilderData } from "@/composables/useBuilderData";
import {
  useStudioRouter,
  useDialogState,
  useSelectedIds,
  clearRowSelection,
  resolveBulkTargets,
} from "@/features/Studio/core/composables";
import {
  SkeletonTable,
  PageHeader,
  DeleteConfirmDialog,
  EmptyState,
  SearchOrBulkToolbar,
  StudioPanelShell,
  StudioTableHeader,
  StudioTableColGroup,
  StudioTableColumnMenu,
} from "@/features/Studio/core/components";

import { PageGridCard, PagesContextMenuContent } from "./components";
import { useCreatePageDialog } from "./composables/useCreatePageDialog";
import { toast } from "vue-sonner";
import {
  usePagesListState,
  type PagesFilter,
  type PagesSort,
  type PagesSortKey,
} from "./composables/usePagesListState";
import { usePageActions } from "./composables/usePageActions";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { useStudioMetrics } from "@/features/Studio/metrics/composables/useStudioMetrics";
import { CONTRIBUTOR_PAGES_EMPTY_DESCRIPTION } from "@/composables/useComposerAccess";
import { usePageResourceBank } from "./composables/usePageResourceBank";
import { useInlineRename } from "@/features/Studio/core/composables/useInlineRename";
import { usePagesTable } from "./composables/usePagesTable";
import { usePageDeleteWithRoutingGuard } from "./composables/usePageDeleteWithRoutingGuard";
import PageDeleteRoutingBlockedDialog from "./dialogs/PageDeleteRoutingBlockedDialog.vue";
import { log } from "@/lib/utils/logger";
import type { CmsPageUsage } from "../../../../lib/cms/pageUsage";
import { GetCmsPageUsageIndexResponseSchema } from "../../../../lib/cms/actionSchemas";
import {
  toStudioTableHeaderTable,
  getStudioTableColWidthStyle,
} from "@/features/Studio/core/lib/studioTableHeader";
import { CMS_PAGE_USAGE_UPDATED_EVENT } from "./lib/cmsPageUsageEvents";

const VIEW_MODE_KEY = "aria:pages:view-mode";
const GRID_SORT_KEY = "aria:pages:grid-sort";
function parsePagesSort(value: unknown): PagesSort {
  const fallback: PagesSort = { key: "updated", direction: "desc" };
  if (
    value === "name" ||
    value === "status" ||
    value === "updated" ||
    value === "visits" ||
    value === "description"
  ) {
    return { key: value, direction: value === "updated" || value === "visits" ? "desc" : "asc" };
  }

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as { key?: unknown; direction?: unknown };
  const key = record.key;
  const direction = record.direction;
  const validKey: PagesSortKey | null = (
    key === "name" ||
    key === "slug" ||
    key === "description" ||
    key === "status" ||
    key === "updated" ||
    key === "visits"
  ) ? key : null;
  const validDirection = (
    direction === "asc" ||
    direction === "desc"
  ) ? direction : null;

  return validKey && validDirection
    ? { key: validKey, direction: validDirection }
    : fallback;
}

const { pages, layouts, isLoading, refreshPagesNow, isReady, applyOptimisticPageRemoval } =
  useBuilderData();
const actions = usePageActions();
const { deletePage, deletePagesBatch } = useStudioActions();
const {
  blockedDialogOpen,
  blockedImpact,
  blockedMessagePageLabel,
  canUnbindCollections,
  isUnbinding,
  deletePageWithGuard,
  confirmUnbindAndDelete,
  cancelBlockedDelete,
} = usePageDeleteWithRoutingGuard({
  deletePage,
  resolvePageId: (slug) => pages.value.find((page) => page.slug === slug)?.id,
  onDeleted: refreshPagesNow,
});
const pageResourceBank = usePageResourceBank();

const PAGE_PREFETCH_INTENT_DELAY_MS = 125;
const pendingPrefetches = new Map<string, number>();

function shouldPrefetchPage(): boolean {
  if (document.visibilityState === "hidden" || !navigator.onLine) return false;

  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;

  return !connection?.saveData && connection?.effectiveType !== "slow-2g";
}

function schedulePagePrefetch(slug: string) {
  if (!shouldPrefetchPage() || pendingPrefetches.has(slug)) return;

  const timer = window.setTimeout(() => {
    pendingPrefetches.delete(slug);
    void import("./PageDetailView.vue");
    void pageResourceBank.prefetchPage(slug, "hover");
  }, PAGE_PREFETCH_INTENT_DELAY_MS);

  pendingPrefetches.set(slug, timer);
}

function cancelPagePrefetch(slug: string): void {
  const timer = pendingPrefetches.get(slug);
  if (timer === undefined) return;
  window.clearTimeout(timer);
  pendingPrefetches.delete(slug);
}

watch(
  pages,
  (nextPages) => {
    pageResourceBank.seedInventory(nextPages);
  },
  { immediate: true },
);

onMounted(() => {
  void refreshCmsPageUsages();
  window.addEventListener(
    CMS_PAGE_USAGE_UPDATED_EVENT,
    handleCmsPageUsageUpdated,
  );
});

onUnmounted(() => {
  for (const timer of pendingPrefetches.values()) {
    window.clearTimeout(timer);
  }
  pendingPrefetches.clear();
  window.removeEventListener(
    CMS_PAGE_USAGE_UPDATED_EVENT,
    handleCmsPageUsageUpdated,
  );
});

onActivated(() => {
  if (canViewStudioMetrics.value) {
    void studioMetrics.refreshAvailability().then(() => {
      if (
        studioMetrics.isCloudflarePlatform.value &&
        studioMetrics.canShowMetrics.value
      ) {
        void studioMetrics.ensureTrafficLoaded();
      }
    });
  }
});

const inlineRename = useInlineRename<string>({
  commitRename: async (slug, title) => {
    await actions.renamePage(slug, title);
  },
});
const route = useRoute();
const router = useStudioRouter();
const { t } = useStudioI18n();
const {
  canCreatePage,
  canEditInComposer,
  isContributor,
  canViewStudioMetrics,
  getForbiddenMessage,
} = useStudioCapabilities();

const studioMetrics = useStudioMetrics();
const showTrafficMetrics = computed(
  () =>
    studioMetrics.isCloudflarePlatform.value &&
    studioMetrics.canShowMetrics.value,
);

const createPageDialog = useCreatePageDialog();
const deleteDialog = useDialogState();
const pagesToDelete = ref<string[]>([]);
const pagesToDuplicate = ref<string[]>([]);

const viewMode = ref<"table" | "grid">(
  (localStorage.getItem(VIEW_MODE_KEY) as "table" | "grid") ?? "table",
);
const cmsPageUsagesById = ref<ReadonlyMap<string, readonly CmsPageUsage[]>>(
  new Map(),
);

const {
  searchQuery,
  activeFilter,
  sortBy,
  currentPage,
  filteredTree,
  paginatedTree,
  totalPages,
  filters,
} = usePagesListState(pages, 20, {
  visitsBySlug: studioMetrics.visitsBySlug,
  trafficSortEnabled: showTrafficMetrics,
});

try {
  sortBy.value = parsePagesSort(
    JSON.parse(localStorage.getItem(GRID_SORT_KEY) ?? "null"),
  );
} catch {
  sortBy.value = parsePagesSort(localStorage.getItem(GRID_SORT_KEY));
}

const sortOptions = computed<Array<{ label: string; value: PagesSort }>>(() => {
  const options = [
    { label: t("pages.sort.recentlyUpdated"), value: { key: "updated", direction: "desc" } },
    { label: t("pages.sort.oldestUpdated"), value: { key: "updated", direction: "asc" } },
    { label: t("pages.sort.nameAsc"), value: { key: "name", direction: "asc" } },
    { label: t("pages.sort.nameDesc"), value: { key: "name", direction: "desc" } },
    { label: t("pages.sort.slugAsc"), value: { key: "slug", direction: "asc" } },
    { label: t("pages.sort.slugDesc"), value: { key: "slug", direction: "desc" } },
    { label: t("pages.sort.descriptionAsc"), value: { key: "description", direction: "asc" } },
    { label: t("pages.sort.descriptionDesc"), value: { key: "description", direction: "desc" } },
    { label: t("pages.sort.statusAsc"), value: { key: "status", direction: "asc" } },
    { label: t("pages.sort.statusDesc"), value: { key: "status", direction: "desc" } },
  ] satisfies Array<{ label: string; value: PagesSort }>;
  if (!showTrafficMetrics.value) return options;
  return [
    ...options,
    { label: t("pages.sort.mostVisits"), value: { key: "visits", direction: "desc" } },
    { label: t("pages.sort.fewestVisits"), value: { key: "visits", direction: "asc" } },
  ];
});

const layoutMap = computed(() => {
  const map = new Map<string, string>();
  for (const l of layouts.value) {
    map.set(l.id, l.name);
  }
  return map;
});

async function refreshCmsPageUsages(): Promise<void> {
  try {
    const { data, error } = await serverActions.cms.pages.usageIndex({});
    if (error) throw error;
    const parsed = GetCmsPageUsageIndexResponseSchema.parse(data);
    cmsPageUsagesById.value = new Map(
      Object.entries(parsed.usagesByPageId).map(([pageId, usages]) => [
        pageId,
        usages,
      ]),
    );
  } catch (error) {
    log("warn", "[PagesView] Failed to load CMS page usage index", { error });
  }
}

function handleCmsPageUsageUpdated(): void {
  void refreshCmsPageUsages();
}

const { table, rowSelection } = usePagesTable({
  data: paginatedTree,
  layoutMap,
  inlineRename,
  visitsBySlug: studioMetrics.visitsBySlug,
  showVisitsColumn: showTrafficMetrics,
  trafficSparklineForSlug: studioMetrics.sparklineForSlug,
  showTrafficColumn: showTrafficMetrics,
  pageUsagesById: cmsPageUsagesById,
});

const selectedSlugs = useSelectedIds(
  table,
  (row) => row.page.slug,
  rowSelection,
);

const reorderableColumns = computed(() =>
  table.getAllLeafColumns().filter((c) => c.id !== "select"),
);

function onColumnReorder(columns = reorderableColumns.value) {
  const newOrder = columns.map((c) => c.id);
  const allIds = table.getAllLeafColumns().map((c) => c.id);
  const fixedIds = allIds.filter((id) => !newOrder.includes(id));
  table.setColumnOrder([...fixedIds, ...newOrder]);
}
function toggleView() {
  viewMode.value = viewMode.value === "table" ? "grid" : "table";
  localStorage.setItem(VIEW_MODE_KEY, viewMode.value);
}

function handleSearch(val: string | number) {
  searchQuery.value = String(val);
  currentPage.value = 1;
}

function handleSort(nextSort: PagesSort) {
  const parsed = parsePagesSort(nextSort);
  sortBy.value = parsed;
  currentPage.value = 1;
  localStorage.setItem(GRID_SORT_KEY, JSON.stringify(parsed));
}

function handleFilter(key: PagesFilter) {
  activeFilter.value = key;
  currentPage.value = 1;
  const query = key === "all" ? {} : { filter: key };
  router.navigateTo(`/pages${key === "all" ? "" : `?filter=${key}`}`);
}

watch(
  () => route.query.filter,
  (val) => {
    if (
      val &&
      val !== activeFilter.value &&
      ["all", "published", "draft", "archived", "modified"].includes(
        val as string,
      )
    ) {
      activeFilter.value = val as PagesFilter;
      currentPage.value = 1;
    } else if (!val && activeFilter.value !== "all") {
      activeFilter.value = "all";
      currentPage.value = 1;
    }
  },
);

watch(showTrafficMetrics, (enabled) => {
  if (!enabled && sortBy.value.key === "visits") {
    handleSort({ key: "updated", direction: "desc" });
  }
});

function handleEdit(slug: string) {
  cancelPagePrefetch(slug);
  void pageResourceBank.prefetchPage(slug, "active");
  router.navigateTo(`/pages/${slug}`);
}

function handleEditInComposer(slug: string) {
  if (!canEditInComposer.value) {
    toast.error(getForbiddenMessage("save.page"));
    return;
  }
  router.startEditing("page", slug);
}

function confirmDelete(slug?: string) {
  const targets = resolveBulkTargets(slug, selectedSlugs.value);
  if (targets.length === 0) return;
  pagesToDelete.value = targets;
  deleteDialog.open();
}

async function handleDeleteConfirm() {
  const slugs = pagesToDelete.value;
  if (slugs.length === 0) return;

  if (slugs.length > 1) {
    const queue = [...slugs];
    const total = queue.length;

    pagesToDelete.value = [];
    deleteDialog.close();
    clearRowSelection(rowSelection);

    const rollback = applyOptimisticPageRemoval(queue);

    void deletePagesBatch(queue, { silent: true }).then(async (result) => {
      if (result.succeeded === 0) {
        rollback();
      }

      if (result.failed === 0) {
        toast.success(
          result.succeeded === 1
            ? t("pages.deleted")
            : t("pages.deletedBatch", { count: result.succeeded }),
        );
      } else if (result.succeeded > 0) {
        toast.error(t("pages.deletePartialFailed", { count: result.succeeded, total }));
      } else {
        toast.error(t("pages.deleteFailed", { count: total }));
      }

      await refreshPagesNow();
    });
    return;
  }

  const slug = slugs[0]!;
  const pageLabel =
    pages.value.find((page) => page.slug === slug)?.title ?? slug;

  deleteDialog.close();
  pagesToDelete.value = [];
  clearRowSelection(rowSelection);

  const ok = await deletePageWithGuard({
    slug,
    pageLabel,
    silent: true,
  });

  if (ok) {
    toast.success(t("pages.deleted"));
  }
}

async function executeDuplicate() {
  const slugs = pagesToDuplicate.value;
  if (slugs.length === 0) return;

  let succeeded = 0;
  for (const slug of slugs) {
    const result = await actions.duplicatePage(slug);
    if (result) succeeded++;
  }

  pagesToDuplicate.value = [];
  clearRowSelection(rowSelection);

  if (succeeded > 0) {
    toast.success(
      succeeded === 1
        ? t("pages.duplicated")
        : t("pages.duplicatedBatch", { count: succeeded }),
    );
  }
}

function confirmDuplicate(slug?: string) {
  const targets = resolveBulkTargets(slug, selectedSlugs.value);
  if (targets.length === 0) return;
  pagesToDuplicate.value = targets;
  executeDuplicate();
}
</script>

<template>
  <StudioPanelShell class="page-card-enter">
    <PageHeader
      :title="t('pages.title')"
      :description="t('pages.description')"
      class="min-h-[5.5rem] px-5 py-3"
      :search-query="searchQuery"
      entity-label-singular="page"
      :create-label="t('pages.new')"
      :hide-create="!canCreatePage"
      @update:search-query="handleSearch"
      @create="createPageDialog.open"
    >
      <template #search>
        <SearchOrBulkToolbar
          :count="selectedSlugs.length"
          entity-label="page"
          :search-query="searchQuery"
          :search-placeholder="t('pages.search')"
          @update:search-query="handleSearch"
          @duplicate="confirmDuplicate()"
          @delete="confirmDelete()"
        />
      </template>
      <template #toolbar>
        <FilterIconMenu
          :model-value="activeFilter"
          :filters="filters"
          @update:model-value="handleFilter($event as PagesFilter)"
        />
        <HeaderActionDropdownTooltip v-if="viewMode === 'grid'" :label="t('pages.sort')">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="headerAction" size="icon-header">
                <span :class="[studioIcons.sort, 'size-3.5 shrink-0']" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-40">
              <DropdownMenuItem
                v-for="option in sortOptions"
                :key="`${option.value.key}:${option.value.direction}`"
                class="cursor-pointer text-xs"
                @select.prevent="handleSort(option.value)"
              >
                <span
                  v-if="
                    option.value.key === sortBy.key &&
                    option.value.direction === sortBy.direction
                  "
                  :class="[studioIcons.check, 'mr-1.5 size-3.5 text-primary']"
                />
                <span v-else class="mr-1.5 w-3.5" />
                {{ option.label }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </HeaderActionDropdownTooltip>
        <StudioTableColumnMenu
          v-if="viewMode === 'table'"
          :columns="reorderableColumns"
          :locked-column-ids="['page']"
          @reorder="onColumnReorder"
        />
        <HeaderActionTooltip
          :label="viewMode === 'table' ? t('pages.gridView') : t('pages.tableView')"
        >
          <Button variant="headerAction" size="icon-header" @click="toggleView">
            <span
              v-if="viewMode === 'grid'"
              :class="[studioIcons.list, 'size-3.5 shrink-0']"
            />
            <span v-else :class="[studioIcons.grid, 'size-3.5 shrink-0']" />
          </Button>
        </HeaderActionTooltip>
      </template>
    </PageHeader>

    <!-- Scrollable content -->
    <div
      class="flex-1 min-h-0 overflow-x-clip overflow-y-auto overscroll-y-none"
      style="touch-action: pan-y"
    >
      <!-- Loading (only on initial load when no data exists) -->
      <SkeletonTable
        v-if="isLoading && filteredTree.length === 0"
        :rows="5"
        :columns="
          table.getAllLeafColumns().filter((c) => c.getIsVisible()).length + 1
        "
      />

      <!-- Empty -->
      <EmptyState
        v-else-if="filteredTree.length === 0"
        :icon="studioIcons.pages"
        :entity-label="activeFilter === 'all' ? t('pages.title').toLowerCase() : t('pages.empty.matching')"
        entity-label-singular="page"
        :hide-action="activeFilter !== 'all' || !canCreatePage"
        :description="
          activeFilter === 'all' && isContributor
            ? CONTRIBUTOR_PAGES_EMPTY_DESCRIPTION
            : activeFilter === 'all'
              ? t('pages.empty.create')
              : t('pages.empty.filtered')
        "
        @create="createPageDialog.open"
      />

      <!-- Table view -->
      <div v-else-if="viewMode === 'table'" class="rounded-none">
        <StudioTableHeader
          :table="toStudioTableHeaderTable(table)"
          :get-head-cell-class="() => 'px-5'"
        />
        <Table class="w-full border-collapse table-fixed">
          <StudioTableColGroup :table="toStudioTableHeaderTable(table)" />
          <TableBody>
            <ContextMenu v-for="row in table.getRowModel().rows" :key="row.id">
              <ContextMenuTrigger as-child>
                <TableRow
                  class="group cursor-pointer border-b border-border! border-dashed transition-all duration-100 hover:bg-sidebar/30 hover:[box-shadow:inset_2px_0_0_0_var(--primary),inset_-2px_0_0_0_var(--primary)] data-[state=selected]:bg-card/50"
                  :data-state="row.getIsSelected() ? 'selected' : undefined"
                  @mouseenter="schedulePagePrefetch(row.original.page.slug)"
                  @mouseleave="cancelPagePrefetch(row.original.page.slug)"
                  @focusin="schedulePagePrefetch(row.original.page.slug)"
                  @focusout="cancelPagePrefetch(row.original.page.slug)"
                  @click="handleEdit(row.original.page.slug)"
                >
                  <TableCell
                    v-for="cell in row.getVisibleCells()"
                    :key="cell.id"
                    :data-column-id="cell.column.id"
                    :style="getStudioTableColWidthStyle(cell.column)"
                    class="min-w-0 overflow-hidden px-5 py-3 text-xs"
                  >
                    <FlexRender
                      :render="cell.column.columnDef.cell"
                      :props="cell.getContext()"
                    />
                  </TableCell>
                </TableRow>
              </ContextMenuTrigger>
              <PagesContextMenuContent
                :page="row.original.page"
                @open="handleEdit(row.original.page.slug)"
                @edit-in-composer="handleEditInComposer(row.original.page.slug)"
                @rename="
                  inlineRename.startRename(
                    row.original.page.slug,
                    row.original.page.title,
                  )
                "
                @duplicate="confirmDuplicate(row.original.page.slug)"
                @publish="actions.togglePublish(row.original.page)"
                @unpublish="actions.togglePublish(row.original.page)"
                @archive="actions.archivePage(row.original.page.slug)"
                @unarchive="actions.unarchivePage(row.original.page.slug)"
                @regenerate-thumbnail="
                  actions.regenerateThumbnail(row.original.page.slug)
                "
                @delete="confirmDelete(row.original.page.slug)"
              />
            </ContextMenu>
          </TableBody>
        </Table>
      </div>

      <!-- Grid view -->
      <div
        v-else
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-7 p-7"
      >
        <ContextMenu v-for="node in paginatedTree" :key="node.page.id">
          <ContextMenuTrigger as-child>
            <PageGridCard
              :page="node.page"
              :traffic-visits="
                showTrafficMetrics
                  ? studioMetrics.visitsForSlug(node.page.slug)
                  : null
              "
              :traffic-sparkline="
                showTrafficMetrics
                  ? studioMetrics.sparklineForSlug(node.page.slug)
                  : []
              "
              :cms-usages="cmsPageUsagesById.get(node.page.id) ?? []"
              :is-thumbnail-pending="
                actions.isPageThumbnailPending(node.page.id)
              "
              :thumbnail-refresh-token="
                actions.getPageThumbnailRefreshToken(node.page.id)
              "
              :is-renaming="inlineRename.editingId.value === node.page.slug"
              :editing-title="inlineRename.editingValue.value"
              @edit="handleEdit(node.page.slug)"
              @rename="
                inlineRename.startRename(node.page.slug, node.page.title)
              "
              @duplicate="confirmDuplicate(node.page.slug)"
              @delete="confirmDelete(node.page.slug)"
              @publish="actions.togglePublish(node.page)"
              @unpublish="actions.togglePublish(node.page)"
              @archive="actions.archivePage(node.page.slug)"
              @unarchive="actions.unarchivePage(node.page.slug)"
              @regenerate-thumbnail="
                actions.regenerateThumbnail(node.page.slug)
              "
              @view="handleEditInComposer(node.page.slug)"
              @prefetch="schedulePagePrefetch(node.page.slug)"
              @cancel-prefetch="cancelPagePrefetch(node.page.slug)"
              @update-editing-title="inlineRename.editingValue.value = $event"
              @confirm-rename="inlineRename.confirmRename()"
              @cancel-rename="inlineRename.cancelRename()"
              @rename-keydown="inlineRename.handleRenameKeydown"
            />
          </ContextMenuTrigger>
          <PagesContextMenuContent
            :page="node.page"
            @open="handleEdit(node.page.slug)"
            @edit-in-composer="handleEditInComposer(node.page.slug)"
            @rename="inlineRename.startRename(node.page.slug, node.page.title)"
            @duplicate="confirmDuplicate(node.page.slug)"
            @publish="actions.togglePublish(node.page)"
            @unpublish="actions.togglePublish(node.page)"
            @archive="actions.archivePage(node.page.slug)"
            @unarchive="actions.unarchivePage(node.page.slug)"
            @regenerate-thumbnail="actions.regenerateThumbnail(node.page.slug)"
            @delete="confirmDelete(node.page.slug)"
          />
        </ContextMenu>
      </div>
    </div>

    <!-- Pagination Footer -->
    <div
      v-if="totalPages > 1 && !isLoading"
      class="flex h-10 shrink-0 items-center justify-end border-t border-border border-dashed bg-background px-7 select-none"
    >
      <span class="text-2xs text-muted-foreground tabular-nums">
        {{ currentPage }} / {{ totalPages }}
      </span>
      <div class="flex items-center gap-0 pl-6">
        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground hover:text-foreground"
          :disabled="currentPage <= 1"
          @click="currentPage--"
        >
          <span :class="[studioIcons.chevronLeft, 'size-4']" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="text-primary hover:text-foreground"
          :disabled="currentPage >= totalPages"
          @click="currentPage++"
        >
          <span :class="[studioIcons.chevronRight, 'size-4']" />
        </Button>
      </div>
    </div>
  </StudioPanelShell>

    <DeleteConfirmDialog
      :open="deleteDialog.isOpen.value"
      :title="
        pagesToDelete.length > 1 ? t('pages.deleteSelectedTitle') : t('pages.deleteTitle')
      "
      :description="
        pagesToDelete.length > 1
          ? t('pages.deleteSelectedDescription', { count: pagesToDelete.length })
          : t('pages.deleteDescription')
      "
      :item-name="pagesToDelete.length === 1 ? pagesToDelete[0] : undefined"
      @update:open="
        deleteDialog.isOpen.value ? deleteDialog.close() : deleteDialog.open()
      "
      @confirm="handleDeleteConfirm"
    />

    <PageDeleteRoutingBlockedDialog
      :open="blockedDialogOpen"
      :page-label="blockedMessagePageLabel"
      :impact="blockedImpact"
      :can-unbind="canUnbindCollections"
      :is-loading="isUnbinding"
      @update:open="(open: boolean) => { if (!open) cancelBlockedDelete(); }"
      @cancel="cancelBlockedDelete()"
      @unbind-and-delete="void confirmUnbindAndDelete()"
    />
</template>

<style scoped>
/* Locked sticky table header */
:deep([data-slot="table-container"]) {
  overflow: visible;
}
:deep(thead) {
  position: sticky;
  top: 0;
  z-index: 20;
  display: table-header-group;
}
:deep(thead tr) {
  background: var(--background);
}
:deep(th) {
  background: var(--background);
}
</style>
