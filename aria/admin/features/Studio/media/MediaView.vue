<script setup lang="ts">
/**
 * MediaView — Studio Media Library Full-featured media library. Supports
 * upload, preview, rename, duplicate, delete, font preview, Cloudflare.
 */

import {
  computed,
  onMounted,
  onActivated,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import { useRoute } from "vue-router";
import { Button } from "@/components/ui/button";
import FilterIconMenu from "@/features/Studio/core/components/FilterIconMenu.vue";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import HeaderActionDropdownTooltip from "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import MediaGridCard from "./components/MediaGridCard.vue";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { formatFileSize, formatUploadedAt, splitMediaFileName } from "./utils";
import {
  useMediaAssets,
  useMediaSync,
  useMediaViewState,
  useMediaGrouping,
  useMediaOrganizeState,
} from "./composables";
import type {
  MediaSort,
  MediaViewFilterId,
} from "./composables/useMediaViewState";
import type { MediaAsset } from "./types/media";
import DeleteMediaDialog from "./dialogs/DeleteMediaDialog.vue";
import MediaSyncDialog from "./dialogs/MediaSyncDialog.vue";
import PreviewMediaDialog from "./dialogs/PreviewMediaDialog.vue";
import RenameMediaDialog from "./dialogs/RenameMediaDialog.vue";
import MediaOrganizerRail from "./components/MediaOrganizerRail.vue";
import MediaContextMenuContent from "./components/MediaContextMenuContent.vue";
import { parseMediaTypeFilter } from "./lib/mediaRouteFilter";
import {
  useSelectedIds,
  clearRowSelection,
  resolveBulkTargets,
  useStudioRouter,
} from "@/features/Studio/core/composables";
import SearchOrBulkToolbar from "@/features/Studio/core/components/SearchOrBulkToolbar.vue";
import StudioLeftRailReveal from "@/features/Studio/core/components/StudioLeftRailReveal.vue";
import StudioPanelShell from "@/features/Studio/core/components/StudioPanelShell.vue";
import StudioTableHeader from "@/features/Studio/core/components/StudioTableHeader.vue";
import StudioTableColGroup from "@/features/Studio/core/components/StudioTableColGroup.vue";
import StudioTableColumnMenu from "@/features/Studio/core/components/StudioTableColumnMenu.vue";
import { useInlineRename } from "@/features/Studio/core/composables/useInlineRename";
import { useMediaTable } from "./composables/useMediaTable";
import {
  toStudioTableHeaderTable,
  getStudioTableColWidthStyle,
} from "@/features/Studio/core/lib/studioTableHeader";
import { FlexRender } from "@tanstack/vue-table";
import { toast } from "vue-sonner";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import "@/features/Studio/media/styles/media-masonry.css";
import {
  useStudioOrganizerDragState,
  ORGANIZER_DRAG_IDS_MIME,
  getOrganizerDropCommit,
} from "@/features/Studio/core/composables/useStudioOrganizerDragState";
import {
  beginOrganizerGridCardDrag,
  beginOrganizerListRowDrag,
  endOrganizerDragGhost,
} from "@/features/Studio/core/lib/organizerDragGhost";
import "@/features/Studio/core/styles/organizer-drag-ghost.css";

defineOptions({ name: "MediaView" });

const route = useRoute();
const studioRouter = useStudioRouter();
const { t } = useStudioI18n();
const mediaSortOptions = computed<Array<{ label: string; value: MediaSort }>>(() => [
  { label: t("media.sort.recent"), value: { key: "uploaded", direction: "desc" } },
  { label: t("media.sort.oldest"), value: { key: "uploaded", direction: "asc" } },
  { label: t("media.sort.nameAsc"), value: { key: "name", direction: "asc" } },
  { label: t("media.sort.nameDesc"), value: { key: "name", direction: "desc" } },
  { label: t("media.sort.largest"), value: { key: "size", direction: "desc" } },
  { label: t("media.sort.smallest"), value: { key: "size", direction: "asc" } },
  { label: t("media.sort.typeAsc"), value: { key: "type", direction: "asc" } },
  { label: t("media.sort.typeDesc"), value: { key: "type", direction: "desc" } },
  { label: t("media.sort.extensionAsc"), value: { key: "extension", direction: "asc" } },
  { label: t("media.sort.extensionDesc"), value: { key: "extension", direction: "desc" } },
]);

const canUseMediaSync =
  import.meta.env.DEV && import.meta.env.PUBLIC_ARIA_RUNTIME === "cloudflare";

const {
  assets,
  isLoading,
  isUploading,
  isRenameDialogOpen,
  assetToRename,
  renameInput,
  renameExtension,
  renameReferenceCount,
  isRenaming,
  isDeleteDialogOpen,
  assetToDelete,
  isDeleting,
  loadAssets,
  handleUpload,
  handleCopyUrl,
  handleDelete,
  closeDeleteDialog,
  confirmDelete,
  deleteAssetsBatch,
  handleRename,
  closeRenameDialog,
  commitMediaRename,
  confirmRename,
  handleDuplicate,
  canDeleteMedia,
} = useMediaAssets();

const inlineRename = useInlineRename<string>({
  commitRename: async (id, name) => {
    const asset = assets.value.find((a) => a.id === id);
    if (!asset) return false;
    const { extension } = splitMediaFileName(asset.name);
    return commitMediaRename(asset, name, extension);
  },
});

function startMediaInlineRename(asset: MediaAsset): void {
  const { baseName } = splitMediaFileName(asset.name);
  inlineRename.startRename(asset.id, baseName);
}

function openAssetDetails(asset: MediaAsset): void {
  if (inlineRename.editingId.value === asset.id) {
    return;
  }
  studioRouter.navigateTo(`/media/${encodeURIComponent(asset.id)}`);
}

const mediaAssets = computed(() => assets.value);
const grouping = useMediaGrouping(mediaAssets);
const organizeState = useMediaOrganizeState({
  groups: grouping.customGroups,
  hasHydratedFromServer: grouping.hasHydratedFromServer,
});
const dragState = useStudioOrganizerDragState();

const showOrganizerRail = computed(() => grouping.canReadGrouping.value);

const groupCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const group of grouping.customGroups.value) {
    counts[group.id] = grouping.getGroupMemberCount(group.id, assets.value);
  }
  return counts;
});

const {
  searchQuery,
  viewMode,
  sortBy,
  activeFilter,
  activeFilterLabel,
  filters,
  isPreviewDialogOpen,
  previewAsset,
  stats,
  filteredAssets,
  openPreviewDialog,
  closePreviewDialog,
  toggleViewMode,
} = useMediaViewState({
  assets,
  activeGroupId: organizeState.activeGroupId,
  assignments: grouping.mediaGroupAssignments,
});

function handleSort(nextSort: MediaSort): void {
  sortBy.value = nextSort;
}

const viewTitle = computed(
  () => organizeState.activeGroup.value?.name ?? activeFilterLabel.value,
);

const { table, rowSelection } = useMediaTable({
  data: filteredAssets,
  inlineRename,
  grouping: {
    assignments: grouping.mediaGroupAssignments,
    groups: grouping.customGroups,
  },
});

const reorderableColumns = computed(() =>
  table.getAllLeafColumns().filter((column) => column.id !== "select"),
);

function onColumnReorder(columns = reorderableColumns.value) {
  const newOrder = columns
    .map((column) => column.id)
    .filter((id): id is string => Boolean(id));
  const allIds = table.getAllLeafColumns().map((column) => column.id);
  const fixedIds = allIds.filter((id) => !newOrder.includes(id));
  table.setColumnOrder([...fixedIds, ...newOrder]);
}

function handleFilterChange(key: MediaViewFilterId) {
  activeFilter.value = key;
  clearRowSelection(rowSelection);
  organizeState.setActiveTypeFilter(key);
}

async function handleMoveItemsToGroup(
  assetIds: readonly string[],
  groupId?: string,
): Promise<void> {
  const moved = await grouping.moveAssetsToGroup(assetIds, groupId);
  if (moved > 0) {
    toast.success(`Moved ${moved} asset${moved === 1 ? "" : "s"}`);
    clearRowSelection(rowSelection);
  }
}

async function handleMoveToGroup(
  assetId: string,
  groupId?: string,
): Promise<void> {
  await handleMoveItemsToGroup([assetId], groupId);
}

async function executeBulkMoveToGroup(
  groupId?: string,
  anchorId?: string,
): Promise<void> {
  const ids = anchorId
    ? resolveBulkTargets(anchorId, selectedIds.value)
    : [...selectedIds.value];
  if (ids.length === 0) {
    return;
  }

  await handleMoveItemsToGroup(ids, groupId);
}

function handleContextMenuMoveToGroup(
  asset: MediaAsset,
  groupId?: string,
): void {
  const ids = resolveBulkTargets(asset.id, selectedIds.value);
  void handleMoveItemsToGroup(ids, groupId);
}

async function handleCreateGroup(name: string): Promise<void> {
  await grouping.createCustomGroup(name);
}

async function handleRenameGroup(groupId: string, name: string): Promise<void> {
  await grouping.renameCustomGroup(groupId, name);
}

async function handleDeleteGroup(groupId: string): Promise<void> {
  const wasActive = organizeState.activeGroupId.value === groupId;
  await grouping.deleteCustomGroup(groupId);
  if (wasActive) {
    organizeState.setActiveGroup(null);
  }
}

function handleSelectAll(): void {
  organizeState.setActiveGroup(null);
}

function handleSelectGroup(groupId: string): void {
  organizeState.setActiveGroup(groupId);
}

function resolveDragSourceElement(event: DragEvent): HTMLElement | null {
  const current = event.currentTarget;
  if (!(current instanceof HTMLElement)) {
    return null;
  }

  if (viewMode.value === "list") {
    const row = current.closest('tr[data-slot="table-row"]');
    if (row instanceof HTMLElement) {
      return row;
    }
  }

  return current;
}

function handleAssetDragStart(assetId: string, event: DragEvent): void {
  if (!grouping.canUpdateGrouping.value) {
    return;
  }

  const ids =
    viewMode.value === "list"
      ? resolveBulkTargets(assetId, selectedIds.value)
      : [assetId];

  dragState.startDrag(assetId, ids);
  event.dataTransfer?.setData("text/plain", assetId);
  if (ids.length > 1) {
    event.dataTransfer?.setData(ORGANIZER_DRAG_IDS_MIME, JSON.stringify(ids));
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    if (viewMode.value === "list") {
      event.dataTransfer.setData("text/html", " ");
    }
  }

  const source = resolveDragSourceElement(event);

  const dragOptions = {
    itemCount: ids.length,
    source,
    onDragEnd: handleOrganizerDragEnd,
  };

  if (viewMode.value === "list") {
    beginOrganizerListRowDrag(event, dragOptions);
    return;
  }

  beginOrganizerGridCardDrag(event, dragOptions);
}

function handleOrganizerDragEnd(event: DragEvent): void {
  if (
    grouping.canUpdateGrouping.value &&
    !dragState.wasOrganizerDropCommitted()
  ) {
    const commit = getOrganizerDropCommit(event.clientX, event.clientY);
    if (commit) {
      dragState.markOrganizerDropCommitted();
      void handleMoveItemsToGroup(commit.itemIds, commit.groupId);
    }
  }

  dragState.scheduleEndDrag();
}

function handleSearch(val: string | number) {
  searchQuery.value = String(val);
}

const selectedIds = useSelectedIds(table, (row) => row.id, rowSelection);
const selectedCount = computed(() => selectedIds.value.length);
const batchDeleteQueue = ref<MediaAsset[]>([]);
const showBulkToolbar = computed(() => viewMode.value === "list");

function resolveSelectedAssets(ids: readonly string[]): MediaAsset[] {
  return ids
    .map((id) => assets.value.find((asset) => asset.id === id))
    .filter((asset): asset is MediaAsset => asset !== undefined);
}

function confirmBulkDelete(asset?: MediaAsset) {
  const ids = resolveBulkTargets(asset?.id, selectedIds.value);
  if (ids.length === 0) return;

  const targets = resolveSelectedAssets(ids);
  if (targets.length === 0) return;

  if (targets.length === 1) {
    batchDeleteQueue.value = [];
    void handleDelete(targets[0]);
    return;
  }

  batchDeleteQueue.value = targets;
  assetToDelete.value = targets[0];
  isDeleteDialogOpen.value = true;
}

async function executeBulkDuplicate(asset?: MediaAsset) {
  const ids = asset
    ? resolveBulkTargets(asset.id, selectedIds.value)
    : [...selectedIds.value];
  if (ids.length === 0) return;

  let succeeded = 0;
  for (const id of ids) {
    const asset = assets.value.find((entry) => entry.id === id);
    if (asset) {
      await handleDuplicate(asset);
      succeeded += 1;
    }
  }

  clearRowSelection(rowSelection);
  batchDeleteQueue.value = [];

  if (succeeded > 0) {
    toast.success(`${succeeded} asset${succeeded === 1 ? "" : "s"} duplicated`);
  }
  await loadAssets({ force: true });
}

async function handleDeleteConfirm() {
  if (batchDeleteQueue.value.length > 1) {
    const queue = [...batchDeleteQueue.value];
    const total = queue.length;

    batchDeleteQueue.value = [];
    closeDeleteDialog(true);
    clearRowSelection(rowSelection);

    void deleteAssetsBatch(queue).then(
      async ({ succeeded, failed, referenceCleanupNeeded }) => {
        if (failed === 0) {
          toast.success(
            `${succeeded} asset${succeeded === 1 ? "" : "s"} deleted`,
          );
        } else {
          toast.error(`Deleted ${succeeded} of ${total} assets`);
        }

        if (referenceCleanupNeeded) {
          toast.warning(
            "Some deleted assets may still have references that need manual cleanup.",
          );
        }

        await loadAssets({ force: true });
      },
    );
    return;
  }

  batchDeleteQueue.value = [];
  await confirmDelete();
}

watch(
  () => [route.path, route.query.filter, route.query.group] as const,
  ([path, filterVal, groupVal]) => {
    if (path !== "/media") {
      return;
    }

    const parsedFilter = parseMediaTypeFilter(filterVal);
    if (parsedFilter !== activeFilter.value) {
      activeFilter.value = parsedFilter;
    }

    clearRowSelection(rowSelection);
  },
  { immediate: true },
);

const usesMasonryGrid = computed(() => {
  return (
    activeFilter.value === "all" ||
    activeFilter.value === "image" ||
    activeFilter.value === "video"
  );
});

const animatedAssetIds = new Set<string>();

function shouldAnimateAsset(asset: MediaAsset): boolean {
  if (animatedAssetIds.has(asset.id)) {
    return false;
  }

  animatedAssetIds.add(asset.id);
  return true;
}

const {
  isSyncDialogOpen,
  syncPlan,
  syncDirection,
  syncIncludeDeletes,
  isPlanningSync,
  isApplyingSync,
  syncError,
  syncNotice,
  isSyncStatusLoading,
  syncFilter,
  lastSyncLabel,
  syncPrimaryLabel,
  hasSyncConflicts,
  syncSummaryText,
  syncIncomingCount,
  syncConsoleId,
  syncPreviewItems,
  syncHasPreviewItems,
  getSyncAssetSize,
  loadSyncHistory,
  runSyncPlan,
  applySyncPlan,
  startSmartSync,
  openSyncConsole,
  resolveConflictsWith,
  closeSyncDialog,
} = useMediaSync({
  assets,
  formatUploadedAt,
  refreshAssets: () => loadAssets({ force: true }),
});

function closeDeleteDialogWithReset(force = false) {
  batchDeleteQueue.value = [];
  closeDeleteDialog(force);
}

function onCopyUrl(asset: Parameters<typeof handleCopyUrl>[0]) {
  handleCopyUrl(asset);
}

let hasSkippedInitialActivation = false;

onMounted(() => {
  loadAssets();
  void loadSyncHistory();
});

// On KeepAlive re-activation, silently refresh if stale
onActivated(() => {
  if (!hasSkippedInitialActivation) {
    hasSkippedInitialActivation = true;
    return;
  }

  loadAssets({ silent: true });
});

onBeforeUnmount(() => {
  endOrganizerDragGhost();
  dragState.endDrag();
});
</script>

<template>
  <StudioPanelShell variant="rail">
    <template #rail>
      <StudioLeftRailReveal v-if="showOrganizerRail">
        <MediaOrganizerRail
          :groups="grouping.customGroups.value"
          :group-counts="groupCounts"
          :all-count="assets.length"
          :active-filter="organizeState.activeNavFilter.value"
          :can-update-grouping="grouping.canUpdateGrouping.value"
          :on-move-to-group="handleMoveToGroup"
          :on-move-items-to-group="handleMoveItemsToGroup"
          @select-all="handleSelectAll"
          @select-group="handleSelectGroup"
          @create-group="handleCreateGroup"
          @rename-group="handleRenameGroup"
          @delete-group="handleDeleteGroup"
        />
      </StudioLeftRailReveal>
    </template>

      <header
        class="flex h-[4.75rem] shrink-0 items-center justify-between gap-4 border-b border-dashed border-border bg-background px-5 inset-shadow-xs"
      >
        <div class="min-w-0">
          <h1 class="truncate text-xl font-serif font-medium tracking-tight">
            {{ viewTitle }}
          </h1>
        </div>

        <div
          class="flex min-w-0 shrink-0 items-center gap-0 [&_[data-slot=button]:hover]:z-10 [&_[data-slot=button]:focus-visible]:z-10 [&_[data-slot=button][data-state=open]]:z-10"
        >
          <SearchOrBulkToolbar
            :count="selectedCount"
            entity-label="asset"
            :search-query="searchQuery"
            :search-placeholder="t('media.search')"
            :show-bulk="showBulkToolbar"
            :show-delete="canDeleteMedia"
            @update:search-query="handleSearch"
            @duplicate="executeBulkDuplicate()"
            @delete="confirmBulkDelete()"
          >
            <template v-if="grouping.canUpdateGrouping.value" #bulk-actions>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-9 text-muted-foreground hover:text-foreground!"
                  >
                    <span :class="[studioIcons.folder, 'mr-1.5 size-3']" />
                    Move to folder
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  class="max-h-64 w-48 overflow-y-auto"
                >
                  <DropdownMenuItem @click="executeBulkMoveToGroup()">
                    All Media
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    v-for="group in grouping.customGroups.value"
                    :key="group.id"
                    @click="executeBulkMoveToGroup(group.id)"
                  >
                    {{ group.name }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </template>
          </SearchOrBulkToolbar>
          <FilterIconMenu
            :model-value="activeFilter"
            :filters="filters"
            @update:model-value="
              handleFilterChange($event as MediaViewFilterId)
            "
          />
          <StudioTableColumnMenu
            v-if="viewMode === 'list'"
            :columns="reorderableColumns"
            :locked-column-ids="['name']"
            @reorder="onColumnReorder"
          />
          <HeaderActionDropdownTooltip v-if="viewMode === 'grid'" :label="t('media.sort')">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="headerAction" size="icon-header">
                  <span :class="[studioIcons.sort, 'size-3.5 shrink-0']" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-40">
                <DropdownMenuItem
                  v-for="option in mediaSortOptions"
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
          <HeaderActionTooltip
            :label="viewMode === 'grid' ? t('media.listView') : t('media.gridView')"
          >
            <Button
              variant="headerAction"
              size="icon-header"
              @click="toggleViewMode"
            >
              <span
                v-if="viewMode === 'grid'"
                :class="[studioIcons.list, 'size-3.5 shrink-0']"
              />
              <span v-else :class="[studioIcons.grid, 'size-3.5 shrink-0']" />
            </Button>
          </HeaderActionTooltip>
          <div class="ml-2 flex shrink-0 items-center gap-1.5 pl-2">
            <Button
              @click="handleUpload"
              :disabled="isUploading"
              variant="default"
              size="sm"
              class="h-8 shrink-0 text-sm"
              :title="t('media.upload')"
            >
              <span :class="[studioIcons.upload, 'size-3.5 shrink-0']" />
              {{ t("media.upload") }}
            </Button>
            <Button
              v-if="canUseMediaSync"
              variant="outline"
              size="sm"
              class="h-8 px-3"
              :disabled="isPlanningSync || isApplyingSync"
              @click="openSyncConsole"
            >
              <span :class="[studioIcons.refresh, 'mr-1 size-4 shrink-0']" />
              {{ syncPrimaryLabel }}
            </Button>
          </div>
        </div>
      </header>

      <div
        class="page-card-enter relative min-h-0 flex-1 overflow-x-clip overflow-y-auto overscroll-y-none"
      >
        <!-- Loading State -->
        <div v-if="isLoading" class="flex items-center justify-center py-16">
          <span
            :class="[
              studioIcons.refreshLine,
              'size-6 shrink-0 text-muted-foreground animate-spin',
            ]"
          />
        </div>

        <!-- Empty State -->
        <div
          v-else-if="filteredAssets.length === 0"
          class="flex flex-col items-center justify-center py-16"
        >
          <span
            :class="[
              studioIcons.media,
              'size-8 shrink-0 text-muted-foreground mb-2',
            ]"
          />
          <p class="text-sm text-muted-foreground mb-3">
            {{
              searchQuery
                ? `No ${activeFilterLabel.toLowerCase()} found`
                : activeFilter === "all"
                  ? "No media yet"
                  : `No ${activeFilterLabel.toLowerCase()} yet`
            }}
          </p>
          <Button
            v-if="!searchQuery"
            @click="handleUpload"
            :disabled="isUploading"
            variant="ghost"
            size="sm"
            class="gap-1.5 text-xs"
          >
            <span :class="[studioIcons.upload, 'size-3.5 shrink-0']" />
            Upload Files
          </Button>
        </div>

        <!-- Grid View -->
        <div
          v-else-if="viewMode === 'grid'"
          :class="[
            usesMasonryGrid ? 'media-masonry' : 'media-standard-grid',
            'px-7 pt-6 pb-6',
          ]"
        >
          <div
            v-for="(asset, index) in filteredAssets"
            :key="asset.id"
            :class="usesMasonryGrid ? 'media-masonry-item' : 'min-w-0'"
          >
            <MediaGridCard
              :asset="asset"
              :index="index"
              :should-animate="shouldAnimateAsset(asset)"
              :can-delete="canDeleteMedia"
              :can-update-grouping="grouping.canUpdateGrouping.value"
              :custom-groups="grouping.customGroups.value"
              :current-group-id="grouping.getAssetGroupId(asset.id)"
              :draggable="grouping.canUpdateGrouping.value"
              primary-action="open"
              @open="openAssetDetails"
              @preview="openPreviewDialog"
              @copy-url="handleCopyUrl"
              @rename="handleRename"
              @duplicate="handleDuplicate"
              @delete="handleDelete"
              @move-to-group="(groupId) => handleMoveToGroup(asset.id, groupId)"
              @drag-start="handleAssetDragStart(asset.id, $event)"
            />
          </div>
        </div>

        <!-- List View (TanStack) -->
        <div v-else-if="viewMode === 'list'" class="rounded-none">
          <StudioTableHeader
            :table="toStudioTableHeaderTable(table)"
            :get-head-cell-class="() => 'px-5'"
          />
          <Table class="w-full border-collapse table-fixed">
            <StudioTableColGroup :table="toStudioTableHeaderTable(table)" />
            <TableBody>
              <ContextMenu
                v-for="row in table.getRowModel().rows"
                :key="row.id"
              >
                <ContextMenuTrigger as-child>
                  <TableRow
                    class="group cursor-pointer border-b border-border! border-dashed hover:bg-muted/30 hover:[box-shadow:inset_2px_0_0_0_var(--primary),inset_-2px_0_0_0_var(--primary)] transition-all duration-50"
                    :draggable="grouping.canUpdateGrouping.value"
                    @click="openAssetDetails(row.original)"
                    @dragstart="handleAssetDragStart(row.original.id, $event)"
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
                <MediaContextMenuContent
                  :can-delete="canDeleteMedia"
                  :can-update-grouping="grouping.canUpdateGrouping.value"
                  :custom-groups="grouping.customGroups.value"
                  :current-group-id="grouping.getAssetGroupId(row.original.id)"
                  @preview="openPreviewDialog(row.original)"
                  @copy-url="handleCopyUrl(row.original)"
                  @rename="startMediaInlineRename(row.original)"
                  @duplicate="executeBulkDuplicate(row.original)"
                  @delete="confirmBulkDelete(row.original)"
                  @move-to-group="
                    (groupId) =>
                      handleContextMenuMoveToGroup(row.original, groupId)
                  "
                />
              </ContextMenu>
              <TableRow v-if="table.getRowModel().rows.length === 0">
                <TableCell
                  :colspan="table.getAllColumns().length"
                  class="text-center py-8 text-muted-foreground"
                >
                  No results
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <div
        class="flex shrink-0 items-center justify-between gap-3 border-t border-dashed border-border bg-background px-7 py-3 text-2xs text-muted-foreground/80"
      >
        <span>
          {{ t("media.footer.summary", {
            shown: filteredAssets.length,
            total: stats.total,
            size: formatFileSize(stats.size),
          }) }}
        </span>
        <span
          v-if="canUseMediaSync"
          class="hidden items-center text-muted-foreground md:inline-flex"
        >
          <span :class="[studioIcons.published, 'mr-1 size-3.5 shrink-0']" />
          {{ isSyncStatusLoading ? t("media.footer.syncLoading") : lastSyncLabel }}
        </span>
      </div>
  </StudioPanelShell>

  <MediaSyncDialog
    v-if="canUseMediaSync"
    :open="isSyncDialogOpen"
    :sync-plan="syncPlan"
    :sync-direction="syncDirection"
    :sync-include-deletes="syncIncludeDeletes"
    :is-planning-sync="isPlanningSync"
    :is-applying-sync="isApplyingSync"
    :sync-error="syncError"
    :sync-notice="syncNotice"
    :sync-filter="syncFilter"
    :last-sync-label="lastSyncLabel"
    :sync-primary-label="syncPrimaryLabel"
    :has-sync-conflicts="hasSyncConflicts"
    :sync-summary-text="syncSummaryText"
    :sync-incoming-count="syncIncomingCount"
    :sync-console-id="syncConsoleId"
    :sync-preview-items="syncPreviewItems"
    :sync-has-preview-items="syncHasPreviewItems"
    :get-sync-asset-size="getSyncAssetSize"
    @update:open="(open) => !open && closeSyncDialog()"
    @update:sync-filter="syncFilter = $event"
    @update:sync-direction="syncDirection = $event"
    @update:sync-include-deletes="syncIncludeDeletes = $event"
    @close="closeSyncDialog"
    @start-smart-sync="startSmartSync"
    @apply-sync-plan="applySyncPlan"
    @resolve-conflicts="resolveConflictsWith($event)"
    @run-sync-plan="runSyncPlan()"
  />

  <DeleteMediaDialog
    :open="isDeleteDialogOpen"
    :asset-name="assetToDelete?.name"
    :delete-count="batchDeleteQueue.length || undefined"
    :is-deleting="isDeleting"
    @update:open="(open) => !open && closeDeleteDialogWithReset()"
    @cancel="closeDeleteDialogWithReset"
    @confirm="handleDeleteConfirm"
  />

  <RenameMediaDialog
    :open="isRenameDialogOpen"
    :asset-name="assetToRename?.name"
    :extension="renameExtension"
    :reference-count="renameReferenceCount"
    :is-renaming="isRenaming"
    :model-value="renameInput"
    @update:open="(open) => !open && closeRenameDialog()"
    @update:model-value="renameInput = $event"
    @cancel="closeRenameDialog"
    @confirm="confirmRename"
  />

  <PreviewMediaDialog
    :open="isPreviewDialogOpen"
    :asset="previewAsset"
    @update:open="(open) => !open && closePreviewDialog()"
  />
</template>

<style scoped>
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
  box-shadow: 0 1px 0 0 var(--border);
}
:deep(th[data-column-id="select"]),
:deep(td[data-column-id="select"]) {
  width: 40px !important;
  max-width: 40px !important;
  min-width: 40px !important;
  padding-left: 8px !important;
  padding-right: 8px !important;
}
</style>
