<script setup lang="ts">
/**
 * CollectionsView - CMS Collections Management
 *
 * CMS collections management view for Studio.
 * Uses Astro Actions for all data operations.
 */

import { computed, onMounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import { FlexRender } from "@tanstack/vue-table";
import type { z } from "zod";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  DeleteConfirmDialog,
  PageHeader,
  StudioTableColGroup,
  StudioTableHeader,
} from "@/features/Studio/core/components";
import FilterIconMenu from "@/features/Studio/core/components/FilterIconMenu.vue";
import HeaderActionDropdownTooltip from "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import SearchOrBulkToolbar from "@/features/Studio/core/components/SearchOrBulkToolbar.vue";
import StudioTableColumnMenu from "@/features/Studio/core/components/StudioTableColumnMenu.vue";
import {
  clearRowSelection,
  resolveBulkTargets,
  useDialogState,
  useSelectedIds,
  useStudioRouter,
} from "@/features/Studio/core/composables";
import {
  getStudioTableColWidthStyle,
  toStudioTableHeaderTable,
} from "@/features/Studio/core/lib/studioTableHeader";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import { studioIcons } from "@/lib/icons";
import {
  DeleteCollectionRequestSchema,
  DeleteCollectionResponseSchema,
  GetCollectionDeleteImpactRequestSchema,
  GetCollectionDeleteImpactResponseSchema,
} from "../../../../lib/cms/actionSchemas";
import { useCmsCapabilities } from "../composables/useCmsCapabilities";
import { useCmsCollectionsTable } from "../composables/useCmsCollectionsTable";
import { useCollectionsViewState } from "..";
import CmsCollectionContextMenuContent from "../components/CmsCollectionContextMenuContent.vue";
import CmsCollectionGridCard from "../components/CmsCollectionGridCard.vue";
import {
  CmsCollectionSortSchema,
  parseCmsCollectionKindFilter,
  parseCmsCollectionSort,
  parseCmsCollectionViewMode,
  type CmsCollectionSort,
  type CmsCollectionViewMode,
} from "../lib/collectionViewPreferences";
import {
  setCmsCollectionNavigationPreview,
  type CmsCollectionNavigationPreview,
} from "../lib/cmsNavigationPreview";
import {
  invalidateCollectionCache,
  invalidateCollectionsCache,
  invalidateEntryListCache,
  prewarmCollection,
  prewarmCollections,
  prewarmEntryList,
} from "../composables/useCmsDataCache";
import { withCmsActionTimeout } from "../lib/actionTimeout";
import { useStudioI18n } from "@/i18n";

const VIEW_MODE_KEY = "aria:cms:collections:view-mode";
const GRID_SORT_KEY = "aria:cms:collections:grid-sort";

defineOptions({ name: "CollectionsView" });

const router = useStudioRouter();
const { t } = useStudioI18n();

const { canCreateCollection, canDeleteCollection, getForbiddenMessage } =
  useCmsCapabilities();

const {
  searchQuery,
  stats,
  filteredCollections,
  kindFilter,
  sortBy,
  filters,
  isLoading,
  loadError,
  loadCollections,
  getCollectionIcon,
  getCollectionIconForKind,
  setKindFilter,
  setSortBy,
  createCollectionDialog,
} = useCollectionsViewState();

try {
  sortBy.value = parseCmsCollectionSort(
    JSON.parse(localStorage.getItem(GRID_SORT_KEY) ?? "null"),
  );
} catch {
  sortBy.value = parseCmsCollectionSort(null);
}

const viewMode = ref<CmsCollectionViewMode>(
  parseCmsCollectionViewMode(localStorage.getItem(VIEW_MODE_KEY)),
);

function getCollectionIconClass(
  collection: (typeof filteredCollections.value)[number],
): string {
  return collection.iconName
    ? getCollectionIcon(collection.iconName)
    : getCollectionIconForKind(collection.kind);
}

const { table, rowSelection } = useCmsCollectionsTable({
  data: filteredCollections,
  getCollectionIconClass,
});
const selectedCollectionIds = useSelectedIds(
  table,
  (collection) => collection.id,
  rowSelection,
);
const deleteDialog = useDialogState();
const collectionIdsToDelete = ref<string[]>([]);
const isDeletingCollections = ref(false);
const isLoadingDeleteImpact = ref(false);
const deleteImpactLoadFailed = ref(false);
const deleteImpact = ref<z.infer<
  typeof GetCollectionDeleteImpactResponseSchema
> | null>(null);
const deleteCollectionCount = computed(() => collectionIdsToDelete.value.length);
const deleteDialogDescription = computed(() => {
  const base =
    deleteCollectionCount.value > 1
      ? `${deleteCollectionCount.value} collections and their entries will be permanently deleted.`
      : "This collection and its entries will be permanently deleted.";

  if (deleteImpact.value && deleteImpact.value.removedPageBindingCount > 0) {
    const pageCount = deleteImpact.value.affectedPages.length;
    const bindingCount = deleteImpact.value.removedPageBindingCount;
    return `${base} This will also remove ${bindingCount} CMS ${
      bindingCount === 1 ? "binding" : "bindings"
    } from ${pageCount} ${pageCount === 1 ? "page" : "pages"}.`;
  }

  if (deleteImpactLoadFailed.value) {
    return `${base} This may also remove CMS bindings from pages that use the selected collection.`;
  }

  return base;
});

const reorderableColumns = computed(() =>
  table.getAllLeafColumns().filter((column) => column.getCanHide()),
);

const sortOptions = computed<Array<{ label: string; value: CmsCollectionSort }>>(() => [
  { label: t("collections.sort.nameAsc"), value: { key: "label", direction: "asc" } },
  { label: t("collections.sort.nameDesc"), value: { key: "label", direction: "desc" } },
  { label: t("collections.sort.slugAsc"), value: { key: "name", direction: "asc" } },
  { label: t("collections.sort.kindAsc"), value: { key: "kind", direction: "asc" } },
  { label: t("collections.sort.mostEntries"), value: { key: "itemCount", direction: "desc" } },
  { label: t("collections.sort.fewestEntries"), value: { key: "itemCount", direction: "asc" } },
]);

function openCreateDialog(): void {
  if (!canCreateCollection.value) {
    return;
  }
  createCollectionDialog.open();
}

function collectionPreview(
  collection: (typeof filteredCollections.value)[number],
): CmsCollectionNavigationPreview {
  return {
    id: collection.id,
    name: collection.name,
    label: collection.label,
    kind: collection.kind,
    iconClass: getCollectionIconClass(collection),
    itemCount: collection.itemCount,
  };
}

function openCollection(collectionName: string): void {
  const collection = filteredCollections.value.find(
    (item) => item.name === collectionName,
  );
  if (collection) {
    prewarmCollectionNavigation(collection);
    setCmsCollectionNavigationPreview(collectionPreview(collection));
  }
  router.navigateTo(`/collections/${collectionName}`);
}

function prewarmCollectionNavigation(
  collection: (typeof filteredCollections.value)[number],
): void {
  prewarmCollection(collection.name);
  prewarmEntryList({
    collectionId: collection.id,
    page: 1,
    limit: 50,
    sort: [{ field: "updatedAt", direction: "desc" }],
  });
}

function prewarmVisibleCollections(): void {
  prewarmCollections();
  for (const collection of filteredCollections.value.slice(0, 8)) {
    prewarmCollectionNavigation(collection);
  }
}

function handleSearch(value: string | number): void {
  searchQuery.value = String(value);
}

function handleFilter(value: string): void {
  setKindFilter(parseCmsCollectionKindFilter(value));
}

function handleSort(nextSort: CmsCollectionSort): void {
  const parsed = CmsCollectionSortSchema.parse(nextSort);
  setSortBy(parsed);
  localStorage.setItem(GRID_SORT_KEY, JSON.stringify(parsed));
}

function toggleView(): void {
  viewMode.value = viewMode.value === "table" ? "grid" : "table";
  localStorage.setItem(VIEW_MODE_KEY, viewMode.value);
}

function onColumnReorder(columns = reorderableColumns.value): void {
  const newOrder = columns.map((column) => column.id);
  const allIds = table.getAllLeafColumns().map((column) => column.id);
  const fixedIds = allIds.filter((id) => !newOrder.includes(id));
  table.setColumnOrder([...fixedIds, ...newOrder]);
}

async function copyCollectionId(id: string): Promise<void> {
  await navigator.clipboard.writeText(id);
  toast.success("Collection ID copied");
}

async function loadDeleteImpact(ids: readonly string[]): Promise<void> {
  deleteImpact.value = null;
  deleteImpactLoadFailed.value = false;
  if (ids.length === 0) return;

  isLoadingDeleteImpact.value = true;
  try {
    const payload = GetCollectionDeleteImpactRequestSchema.parse({ ids });
    const { data, error } = await withCmsActionTimeout(
      actions.cms.collections.deleteImpact(payload),
      "Check collection bindings",
    );
    if (error) {
      deleteImpactLoadFailed.value = true;
      return;
    }
    deleteImpact.value = GetCollectionDeleteImpactResponseSchema.parse(data);
  } catch {
    deleteImpactLoadFailed.value = true;
  } finally {
    isLoadingDeleteImpact.value = false;
  }
}

async function requestDeleteCollections(): Promise<void> {
  if (!canDeleteCollection.value) {
    toast.error(getForbiddenMessage("cms.collections.remove"));
    return;
  }

  const targets = resolveBulkTargets(undefined, selectedCollectionIds.value);
  if (targets.length === 0) return;

  collectionIdsToDelete.value = targets;
  await loadDeleteImpact(targets);
  deleteDialog.open();
}

function handleDeleteDialogOpenChange(open: boolean): void {
  if (open) {
    deleteDialog.open();
    return;
  }

  deleteDialog.close();
  if (!isDeletingCollections.value) {
    collectionIdsToDelete.value = [];
  }
}

async function confirmDeleteCollections(): Promise<void> {
  if (collectionIdsToDelete.value.length === 0) return;
  if (!canDeleteCollection.value) {
    toast.error(getForbiddenMessage("cms.collections.remove"));
    return;
  }

  const targets = [...collectionIdsToDelete.value];
  let succeeded = 0;
  let failed = 0;
  let removedPageBindingCount = 0;

  isDeletingCollections.value = true;
  try {
    if (!deleteImpact.value && !deleteImpactLoadFailed.value) {
      await loadDeleteImpact(targets);
    }

    for (const id of targets) {
      const payload = DeleteCollectionRequestSchema.parse({ id });
      const { data, error } = await withCmsActionTimeout(
        actions.cms.collections.remove(payload),
        "Delete collection",
      );

      if (error) {
        if (!handleActionResultForbidden({ error }, "cms.collections.remove")) {
          toast.error(error.message ?? `Failed to delete collection ${id}`);
        }
        failed++;
        continue;
      }

      const result = DeleteCollectionResponseSchema.parse(data);
      if (result.success === true) {
        invalidateCollectionCache(id);
        invalidateEntryListCache(id);
        removedPageBindingCount += result.removedPageBindingCount;
        succeeded++;
        continue;
      }

      failed++;
      toast.error(`Failed to delete collection ${id}`);
    }

    if (succeeded > 0) {
      invalidateCollectionsCache();
      clearRowSelection(rowSelection);
      await loadCollections({ force: true });
    }

    if (failed === 0) {
      const collectionMessage =
        succeeded === 1
          ? "Collection deleted"
          : `${succeeded} collections deleted`;
      const bindingMessage =
        removedPageBindingCount > 0
          ? ` Removed ${removedPageBindingCount} page ${
              removedPageBindingCount === 1 ? "binding" : "bindings"
            }.`
          : "";
      toast.success(`${collectionMessage}.${bindingMessage}`.trim());
      deleteDialog.close();
      collectionIdsToDelete.value = [];
      deleteImpact.value = null;
      deleteImpactLoadFailed.value = false;
    } else if (succeeded > 0) {
      toast.error(`Deleted ${succeeded} of ${targets.length} collections`);
      deleteDialog.close();
      collectionIdsToDelete.value = [];
      deleteImpact.value = null;
      deleteImpactLoadFailed.value = false;
    } else {
      toast.error(
        targets.length === 1
          ? "Failed to delete collection"
          : `Failed to delete ${targets.length} collections`,
      );
    }
  } finally {
    isDeletingCollections.value = false;
  }
}

watch(filteredCollections, prewarmVisibleCollections, { flush: "post" });

onMounted(prewarmVisibleCollections);
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
    <PageHeader
      :title="t('collections.title')"
      :description="t('collections.description')"
      class="min-h-[5.5rem] px-5 py-3"
      :search-query="searchQuery"
      entity-label-singular="collection"
      :hide-create="true"
      @update:search-query="handleSearch"
      @create="openCreateDialog"
    >
      <template #search>
        <SearchOrBulkToolbar
          :count="selectedCollectionIds.length"
          entity-label="collection"
          :search-query="searchQuery"
          :search-placeholder="t('collections.search')"
          :show-bulk="viewMode === 'table'"
          :show-duplicate="false"
          @update:search-query="handleSearch"
          @delete="requestDeleteCollections"
        />
      </template>
      <template #toolbar>
        <FilterIconMenu
          :model-value="kindFilter"
          :filters="filters"
          @update:model-value="handleFilter"
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
          @reorder="onColumnReorder"
        />
        <HeaderActionTooltip
          :label="viewMode === 'table' ? t('components.gridView') : t('components.tableView')"
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
      <template #actions>
        <Button
          variant="default"
          size="md"
          :disabled="!canCreateCollection"
          :title="
            canCreateCollection
              ? t('collections.new')
              : getForbiddenMessage('cms.collections.create')
          "
          @click="openCreateDialog"
        >
          {{ t("collections.new") }}
        </Button>
      </template>
    </PageHeader>

    <div class="page-card-enter flex-1 min-h-0 overflow-auto">
      <div
        v-if="loadError"
        class="mx-7 my-4 rounded-sm border border-destructive/20 bg-destructive/10 p-4"
      >
        <p class="text-2xs text-destructive select-none">{{ loadError }}</p>
      </div>

      <div
        v-if="isLoading"
        class="flex flex-col items-center justify-center py-16"
      >
        <p class="text-sm text-muted-foreground">Loading collections...</p>
      </div>

      <div
        v-else-if="filteredCollections.length === 0"
        class="flex flex-col items-center justify-center py-16"
      >
        <div class="i-hugeicons:database-01 mb-2 size-8 text-muted-foreground" />
        <p class="mb-3 text-sm text-muted-foreground">
          {{
            searchQuery || kindFilter !== "all"
              ? "No collections found"
              : "No collections yet"
          }}
        </p>
        <Button
          v-if="canCreateCollection && !searchQuery && kindFilter === 'all'"
          variant="outline"
          size="sm"
          @click="openCreateDialog"
        >
          Create your first collection
        </Button>
      </div>

      <div v-else-if="viewMode === 'table'" class="rounded-none">
        <StudioTableHeader
          :table="toStudioTableHeaderTable(table)"
          :get-head-cell-class="() => 'px-5'"
        />
        <Table class="w-full table-fixed border-collapse">
          <StudioTableColGroup :table="toStudioTableHeaderTable(table)" />
          <TableBody>
            <ContextMenu v-for="row in table.getRowModel().rows" :key="row.id">
              <ContextMenuTrigger as-child>
                <TableRow
                  class="group cursor-pointer border-b border-border! border-dashed transition-all duration-50 hover:bg-muted/30 hover:[box-shadow:inset_2px_0_0_0_var(--primary),inset_-2px_0_0_0_var(--primary)] data-[state=selected]:bg-card/50 last:border-b-0"
                  :data-state="row.getIsSelected() ? 'selected' : undefined"
                  @focusin="prewarmCollectionNavigation(row.original)"
                  @mouseenter="prewarmCollectionNavigation(row.original)"
                  @click="openCollection(row.original.name)"
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
              <CmsCollectionContextMenuContent
                :collection="row.original"
                @open="openCollection(row.original.name)"
                @copy-id="copyCollectionId(row.original.id)"
              />
            </ContextMenu>
          </TableBody>
        </Table>
      </div>

      <div
        v-else
        class="grid grid-cols-1 gap-7 p-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      >
        <ContextMenu
          v-for="collection in filteredCollections"
          :key="collection.id"
        >
          <ContextMenuTrigger as-child>
            <CmsCollectionGridCard
              :collection="collection"
              :icon-class="getCollectionIconClass(collection)"
              @focusin="prewarmCollectionNavigation(collection)"
              @mouseenter="prewarmCollectionNavigation(collection)"
              @open="openCollection"
            />
          </ContextMenuTrigger>
          <CmsCollectionContextMenuContent
            :collection="collection"
            @open="openCollection(collection.name)"
            @copy-id="copyCollectionId(collection.id)"
          />
        </ContextMenu>
      </div>
    </div>

    <div
      class="px-7 pb-6 text-xs text-muted-foreground"
    >
      {{ stats.total }} collections
    </div>
  </div>

  <DeleteConfirmDialog
    :open="deleteDialog.isOpen.value"
    :title="
      deleteCollectionCount > 1
        ? 'Delete selected collections?'
    : 'Delete collection'
    "
    :description="deleteDialogDescription"
    :is-loading="isDeletingCollections || isLoadingDeleteImpact"
    :confirm-label="
      deleteCollectionCount > 1 ? t('collections.deleteMany') : t('collections.deleteOne')
    "
    @update:open="handleDeleteDialogOpenChange"
    @confirm="confirmDeleteCollections"
  />
</template>
