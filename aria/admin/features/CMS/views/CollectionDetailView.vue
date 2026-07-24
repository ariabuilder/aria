<script setup lang="ts">
/**
 * CollectionDetailView — CMS collection entries workspace.
 */

import { computed, ref, watch } from "vue";
import { actions } from "astro:actions";
import { useRoute } from "vue-router";
import { FlexRender } from "@tanstack/vue-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  PageHeader,
  StudioTableColGroup,
  StudioTableHeader,
} from "@/features/Studio/core/components";
import FilterIconMenu from "@/features/Studio/core/components/FilterIconMenu.vue";
import HeaderActionDropdownTooltip from "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import SearchOrBulkToolbar from "@/features/Studio/core/components/SearchOrBulkToolbar.vue";
import StudioTableColumnMenu, {
  type StudioTableColumnMenuColumn,
} from "@/features/Studio/core/components/StudioTableColumnMenu.vue";
import {
  resolveBulkTargets,
  useStudioRouter,
} from "@/features/Studio/core/composables";
import {
  getStudioTableColWidthStyle,
  toStudioTableHeaderTable,
} from "@/features/Studio/core/lib/studioTableHeader";
import { studioIcons } from "@/lib/icons";
import { toast } from "vue-sonner";
import { useCollectionDetailState } from "../composables/useCollectionDetailState";
import { useCmsCapabilities } from "../composables/useCmsCapabilities";
import CollectionSchemaPanel from "../components/CollectionSchemaPanel.vue";
import CollectionSettingsPanel from "../components/CollectionSettingsPanel.vue";
import CollectionAccessPolicyPanel from "../components/CollectionAccessPolicyPanel.vue";
import CmsCommentModerationPanel from "../components/CmsCommentModerationPanel.vue";
import CmsCollectionIconPreview from "../components/CmsCollectionIconPreview.vue";
import CmsEntryContextMenuContent from "../components/CmsEntryContextMenuContent.vue";
import CmsEntryGridCard from "../components/CmsEntryGridCard.vue";
import DeleteEntryDialog from "../dialogs/DeleteEntryDialog.vue";
import DeleteCollectionDialog from "../dialogs/DeleteCollectionDialog.vue";
import { useCollectionIcons } from "../composables/useCollectionIcons";
import {
  parseCmsEntryStatusFilter,
  parseCmsEntryViewMode,
  type CmsEntryViewMode,
} from "../lib/entryViewPreferences";
import {
  CmsEntrySortSchema,
  type CmsEntrySort,
} from "../lib/entrySortPreferences";
import type { CmsEntryRow } from "../lib/entryRow";
import type { AriaCollection } from "../../../../lib/cms/schemas";
import { useCmsNavigationPreview } from "../lib/cmsNavigationPreview";
import {
  invalidateCollectionCache,
  invalidateCollectionsCache,
} from "../composables/useCmsDataCache";
import { useStudioI18n } from "@/i18n";

const VIEW_MODE_KEY = "aria:cms:entries:view-mode";

defineOptions({ name: "CollectionDetailView" });

const route = useRoute();
const router = useStudioRouter();
const { t } = useStudioI18n();
const collectionParam = computed(() => String(route.params.name ?? ""));

const { canCreateEntry, canDeleteCollection, getForbiddenMessage } =
  useCmsCapabilities();
const { getCollectionIcon, getCollectionIconForKind } = useCollectionIcons();
const { activeCollectionPreview } = useCmsNavigationPreview();
type CollectionDetailTab = "entries" | "configure";

const activeTab = computed<CollectionDetailTab>(() => {
  if (route.path.endsWith("/schema") || route.path.endsWith("/settings")) {
    return "configure";
  }
  return "entries";
});

const {
  collection,
  loadCollection,
  isLoading: isCollectionLoading,
  loadError: collectionLoadError,
  rows,
  total,
  page,
  totalPages,
  searchQuery,
  statusFilter,
  statusFilters,
  isLoading: isEntriesLoading,
  loadError: entriesLoadError,
  table,
  supportsCover,
  isCreatingEntry,
  entryActions,
  selectedEntryIds,
  clearSelection,
  openCreateEntry,
  openEntryEditor,
  setPage,
  setStatusFilter,
  refreshEntries,
} = useCollectionDetailState(collectionParam);

const viewMode = ref<CmsEntryViewMode>(
  parseCmsEntryViewMode(localStorage.getItem(VIEW_MODE_KEY)),
);
const isAdvancedSettingsOpen = ref(false);
const isDeleteEntryDialogOpen = ref(false);
const entriesPendingDelete = ref<CmsEntryRow[]>([]);
const isDeleteCollectionDialogOpen = ref(false);

const collectionIconClass = computed(() => {
  const loaded = collection.value;
  const preview = activeCollectionPreview.value;
  if (!loaded && preview?.name === collectionParam.value) {
    return preview.iconClass;
  }
  if (!loaded) return getCollectionIconForKind("content");
  return loaded.schema.icon
    ? getCollectionIcon(loaded.schema.icon)
    : getCollectionIconForKind(loaded.kind);
});

const collectionDisplayLabel = computed(
  () =>
    collection.value?.label ??
    (activeCollectionPreview.value?.name === collectionParam.value
      ? activeCollectionPreview.value.label
      : "Entries"),
);

const collectionDisplayName = computed(
  () => collection.value?.name ?? collectionParam.value,
);

const collectionDisplayKind = computed(
  () =>
    collection.value?.kind ??
    (activeCollectionPreview.value?.name === collectionParam.value
      ? activeCollectionPreview.value.kind
      : null),
);

const collectionDisplayCount = computed(() =>
  collection.value
    ? total.value
    : activeCollectionPreview.value?.name === collectionParam.value
      ? activeCollectionPreview.value.itemCount
      : total.value,
);
const reorderableColumns = computed(() =>
  table.getAllLeafColumns().filter((column) => column.id !== "select"),
);

const sortOptions = computed<Array<{ label: string; value: CmsEntrySort }>>(
  () => [
    {
      label: t("cms.entries.sort.recent"),
      value: { key: "updatedAt", direction: "desc" },
    },
    {
      label: t("cms.entries.sort.oldest"),
      value: { key: "updatedAt", direction: "asc" },
    },
    {
      label: t("cms.entries.sort.titleAsc"),
      value: { key: "title", direction: "asc" },
    },
    {
      label: t("cms.entries.sort.titleDesc"),
      value: { key: "title", direction: "desc" },
    },
    {
      label: t("cms.entries.sort.slugAsc"),
      value: { key: "slug", direction: "asc" },
    },
    {
      label: t("cms.entries.sort.publishedNewest"),
      value: { key: "publishedAt", direction: "desc" },
    },
  ],
);

watch(collection, (loaded) => {
  if (!loaded) return;
  const param = collectionParam.value;
  if (param && param !== loaded.name) {
    navigateToTab(activeTab.value);
  }
});

const isLoading = computed(
  () => isCollectionLoading.value || isEntriesLoading.value,
);
const loadError = computed(
  () => collectionLoadError.value ?? entriesLoadError.value,
);
const deleteEntryDialogTitle = computed(() => {
  if (entriesPendingDelete.value.length === 1) {
    return entriesPendingDelete.value[0]?.title || "Untitled";
  }
  return `${entriesPendingDelete.value.length} entries`;
});

function resolveEntryActionTargets(row?: CmsEntryRow): CmsEntryRow[] {
  const ids = resolveBulkTargets(row?.id, selectedEntryIds.value);
  if (ids.length === 0) {
    return [];
  }
  const rowsById = new Map(rows.value.map((entry) => [entry.id, entry]));
  return ids
    .map((id) => rowsById.get(id))
    .filter((entry): entry is CmsEntryRow => Boolean(entry));
}

function navigateToCollections(): void {
  router.navigateTo("/collections");
}

function navigateToEntries(): void {
  const collectionName = collectionDisplayName.value || collectionParam.value;
  if (!collectionName) return;
  router.navigateTo(`/collections/${collectionName}`);
}

function handleBack(): void {
  if (activeTab.value === "configure") {
    navigateToEntries();
    return;
  }
  navigateToCollections();
}

function navigateToTab(tab: CollectionDetailTab): void {
  const collectionName = collectionDisplayName.value || collectionParam.value;
  if (!collectionName) return;
  const suffix = tab === "entries" ? "" : "/settings";
  router.navigateTo(`/collections/${collectionName}${suffix}`);
}

async function handleCollectionConfigured(
  updated: AriaCollection,
): Promise<void> {
  collection.value = updated;
  invalidateCollectionsCache();
  invalidateCollectionCache(updated.id);
  invalidateCollectionCache(updated.name);
  await loadCollection({ force: true });
}

function handleCollectionDeleted(): void {
  invalidateCollectionsCache();
  if (collection.value) {
    invalidateCollectionCache(collection.value.id);
    invalidateCollectionCache(collection.value.name);
  }
  router.navigateTo("/collections");
}

function toggleView(): void {
  viewMode.value = viewMode.value === "table" ? "grid" : "table";
  localStorage.setItem(VIEW_MODE_KEY, viewMode.value);
}

function handleSearch(value: string | number): void {
  searchQuery.value = String(value);
}

function handleFilter(value: string): void {
  setStatusFilter(parseCmsEntryStatusFilter(value));
}

function handleSort(nextSort: CmsEntrySort): void {
  const parsed = CmsEntrySortSchema.parse(nextSort);
  table.setSorting([{ id: parsed.key, desc: parsed.direction === "desc" }]);
}

function onColumnReorder(columns: StudioTableColumnMenuColumn[]): void {
  const newOrder = columns.map((column) => column.id);
  const allIds = table.getAllLeafColumns().map((column) => column.id);
  const fixedIds = allIds.filter((id) => !newOrder.includes(id));
  table.setColumnOrder([...fixedIds, ...newOrder]);
}

async function copyEntryId(id: string): Promise<void> {
  await navigator.clipboard.writeText(id);
  toast.success("Entry ID copied");
}

async function publishEntries(row?: CmsEntryRow): Promise<void> {
  const targets = resolveEntryActionTargets(row);
  if (targets.length === 0) return;
  await entryActions.publishEntries(targets, async () => {
    clearSelection();
    await refreshEntries();
  });
}

async function unpublishEntries(row?: CmsEntryRow): Promise<void> {
  const targets = resolveEntryActionTargets(row);
  if (targets.length === 0) return;
  await entryActions.unpublishEntries(targets, async () => {
    clearSelection();
    await refreshEntries();
  });
}

async function archiveEntries(row?: CmsEntryRow): Promise<void> {
  const targets = resolveEntryActionTargets(row);
  if (targets.length === 0) return;
  await entryActions.archiveEntries(targets, async () => {
    clearSelection();
    await refreshEntries();
  });
}

async function duplicateEntries(row?: CmsEntryRow): Promise<void> {
  const targets = resolveEntryActionTargets(row);
  if (targets.length === 0) return;
  await entryActions.duplicateEntries(targets, async () => {
    clearSelection();
    await refreshEntries();
  });
}

function requestDeleteEntries(row?: CmsEntryRow): void {
  const targets = resolveEntryActionTargets(row);
  if (targets.length === 0) return;
  entriesPendingDelete.value = targets;
  isDeleteEntryDialogOpen.value = true;
}

function handleDeleteEntryDialogOpen(value: boolean): void {
  isDeleteEntryDialogOpen.value = value;
  if (!value) {
    entriesPendingDelete.value = [];
  }
}

async function confirmDeleteEntries(): Promise<void> {
  const targets = entriesPendingDelete.value;
  if (targets.length === 0) return;
  await entryActions.deleteEntries(targets, async () => {
    clearSelection();
    await refreshEntries();
  });
  handleDeleteEntryDialogOpen(false);
}
</script>

<template>
  <div
    class="flex h-full min-w-0 w-full max-w-full flex-col overflow-hidden bg-background [contain:inline-size]"
  >
    <header
      class="flex min-w-0 w-full max-w-full items-center justify-between px-3 pt-3 pb-3 shrink-0"
    >
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="bread"
          size="icon"
          data-testid="collection-detail-back"
          @click="handleBack"
        >
          <span :class="[studioIcons.chevronLeft, 'size-4']" />
        </Button>
        <nav class="flex min-w-0 items-center gap-2 text-sm">
          <button
            type="button"
            class="text-muted-foreground hover:text-primary/80 cursor-pointer transition-colors shrink-0"
            @click="navigateToCollections"
          >
            {{ t("collections.title") }}
          </button>
          <span class="text-muted-foreground/50 shrink-0">/</span>
          <CmsCollectionIconPreview
            v-if="collection"
            :value="collectionIconClass"
            class="size-4 shrink-0 text-muted-foreground"
          />
          <button
            v-if="activeTab === 'configure'"
            type="button"
            class="min-w-0 truncate text-muted-foreground hover:text-primary/80 cursor-pointer transition-colors"
            @click="navigateToEntries"
          >
            {{ collectionDisplayLabel }}
          </button>
          <span v-else class="truncate text-muted-foreground font-medium">
            {{ collectionDisplayLabel }}
          </span>
          <template v-if="activeTab === 'configure'">
            <span class="text-muted-foreground/50 shrink-0">/</span>
            <span class="truncate text-muted-foreground font-medium">
              {{ t("collections.tab.settings") }}
            </span>
          </template>
        </nav>
      </div>

      <div class="sticky right-7 z-20 ml-auto flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="md"
          :class="
            activeTab === 'entries'
              ? 'bg-transparent! border-primary! text-foreground!'
              : ''
          "
          @click="navigateToTab('entries')"
        >
          {{ t("collections.tab.entries") }}
        </Button>
        <Button
          variant="outline"
          size="md"
          :class="
            activeTab === 'configure'
              ? 'bg-transparent! border-primary! text-foreground!'
              : ''
          "
          @click="navigateToTab('configure')"
        >
          {{ t("collections.tab.configure") }}
        </Button>
      </div>
    </header>

    <div
      v-if="activeTab === 'entries'"
      class="flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden [contain:inline-size]"
    >
      <div
        class="h-full min-w-0 w-full max-w-full flex flex-col overflow-hidden"
      >
        <PageHeader
          class="min-w-0 w-full max-w-full shrink-0 [contain:inline-size]"
          :title="collectionDisplayLabel"
          :search-query="searchQuery"
          entity-label-singular="entry"
          :hide-create="true"
          @update:search-query="handleSearch"
          @create="openCreateEntry"
        >
          <template #title>
            <div class="flex min-w-0 items-center gap-3 m-0">
              <CmsCollectionIconPreview
                :value="collectionIconClass"
                class="size-6 shrink-0 text-muted-foreground"
              />
              <h1
                class="truncate text-3xl m-0 font-medium font-serif tracking-tight"
              >
                {{ collectionDisplayLabel }}
              </h1>
              <Badge
                v-if="collectionDisplayKind"
                variant="secondary"
                class="shrink-0 capitalize"
              >
                {{ collectionDisplayKind }}
              </Badge>
            </div>
          </template>
          <template #description>
            <p class="text-sm text-muted-foreground/60">
              <span>{{ collectionDisplayName }}</span>
            </p>
          </template>
          <template #search>
            <SearchOrBulkToolbar
              :count="selectedEntryIds.length"
              entity-label="entry"
              :search-query="searchQuery"
              :search-placeholder="t('cms.entries.search')"
              @update:search-query="handleSearch"
              @duplicate="duplicateEntries()"
              @delete="requestDeleteEntries()"
            >
              <template #bulk-actions>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-9 text-muted-foreground hover:text-foreground!"
                  :disabled="entryActions.isTransitioning.value"
                  @click="publishEntries()"
                >
                  <span :class="[studioIcons.published, 'mr-1.5 size-3']" />
                  {{ t("pages.action.publish") }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-9 text-muted-foreground hover:text-foreground!"
                  :disabled="entryActions.isTransitioning.value"
                  @click="unpublishEntries()"
                >
                  <span :class="[studioIcons.unpublish, 'mr-1.5 size-3']" />
                  {{ t("pages.action.unpublish") }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-9 text-muted-foreground hover:text-foreground!"
                  :disabled="entryActions.isTransitioning.value"
                  @click="archiveEntries()"
                >
                  <span :class="[studioIcons.archive, 'mr-1.5 size-3']" />
                  {{ t("pages.action.archive") }}
                </Button>
              </template>
            </SearchOrBulkToolbar>
          </template>
          <template #toolbar>
            <FilterIconMenu
              :model-value="statusFilter"
              :filters="statusFilters"
              @update:model-value="handleFilter"
            />
            <HeaderActionDropdownTooltip
              v-if="viewMode === 'grid'"
              :label="t('media.sort')"
            >
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="headerAction" size="icon-header">
                    <span :class="[studioIcons.sort, 'size-3.5 shrink-0']" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-44">
                  <DropdownMenuItem
                    v-for="option in sortOptions"
                    :key="`${option.value.key}:${option.value.direction}`"
                    class="cursor-pointer text-xs"
                    @select.prevent="handleSort(option.value)"
                  >
                    <span
                      v-if="
                        table.getState().sorting[0]?.id === option.value.key &&
                        table.getState().sorting[0]?.desc ===
                          (option.value.direction === 'desc')
                      "
                      :class="[
                        studioIcons.check,
                        'mr-1.5 size-3.5 text-primary',
                      ]"
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
              :locked-column-ids="['title']"
              @reorder="onColumnReorder"
            />
            <HeaderActionTooltip
              :label="
                viewMode === 'table'
                  ? t('components.gridView')
                  : t('components.tableView')
              "
            >
              <Button
                variant="headerAction"
                size="icon-header"
                @click="toggleView"
              >
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
              :disabled="!canCreateEntry || !collection || isCreatingEntry"
              :title="
                canCreateEntry
                  ? t('cms.entries.new')
                  : getForbiddenMessage('cms.entries.create')
              "
              @click="openCreateEntry"
            >
              {{
                isCreatingEntry
                  ? t("cms.entries.creating")
                  : t("cms.entries.new")
              }}
            </Button>
          </template>
        </PageHeader>

        <div class="min-w-0 w-full max-w-full flex-1 overflow-auto">
          <div
            v-if="loadError"
            class="mx-7 my-4 p-4 bg-destructive/10 rounded-sm border border-destructive/20"
          >
            <p class="text-2xs text-destructive">{{ loadError }}</p>
          </div>

          <div
            v-if="isLoading"
            class="flex flex-col items-center justify-center py-16"
          >
            <p class="text-sm text-muted-foreground">
              {{ t("cms.entries.loading") }}
            </p>
          </div>

          <div
            v-else-if="rows.length === 0"
            class="flex flex-col items-center justify-center py-16"
          >
            <template v-if="searchQuery || statusFilter !== 'all'">
              <div
                class="i-hugeicons:file-01 mb-2 size-8 text-muted-foreground"
              />
              <p class="mb-3 text-sm text-muted-foreground">
                {{ t("cms.entries.empty") }}
              </p>
            </template>
            <template v-else>
              <div
                class="i-hugeicons:database-01 mb-2 size-8 text-muted-foreground"
              />
              <p class="mb-1 text-sm font-medium text-foreground">
                {{ t("cms.entries.getStarted") }}
              </p>
              <p
                class="mb-4 max-w-sm text-center text-sm text-muted-foreground"
              >
                {{ t("cms.entries.getStartedDescription") }}
              </p>
              <div
                class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center"
              >
                <Button
                  v-if="collection"
                  variant="outline"
                  size="sm"
                  @click="navigateToTab('configure')"
                >
                  {{ t("cms.entries.setupSchema") }}
                </Button>
                <Button
                  v-if="canCreateEntry && collection"
                  variant="outline"
                  size="sm"
                  :disabled="isCreatingEntry"
                  :title="
                    canCreateEntry
                      ? t('cms.entries.createEntries')
                      : getForbiddenMessage('cms.entries.create')
                  "
                  @click="openCreateEntry"
                >
                  {{
                    isCreatingEntry
                      ? t("cms.entries.creating")
                      : t("cms.entries.createEntries")
                  }}
                </Button>
              </div>
            </template>
          </div>

          <div
            v-else-if="viewMode === 'table'"
            class="min-w-0 w-full max-w-full overflow-x-auto rounded-none [contain:inline-size]"
          >
            <StudioTableHeader
              :table="toStudioTableHeaderTable(table)"
              :get-head-cell-class="() => 'px-5'"
            />
            <Table class="w-full min-w-[72rem] border-collapse table-fixed">
              <StudioTableColGroup :table="toStudioTableHeaderTable(table)" />
              <TableBody>
                <ContextMenu
                  v-for="row in table.getRowModel().rows"
                  :key="row.id"
                >
                  <ContextMenuTrigger as-child>
                    <TableRow
                      class="group cursor-pointer border-b border-border! border-dashed hover:bg-muted/30 hover:[box-shadow:inset_2px_0_0_0_var(--primary),inset_-2px_0_0_0_var(--primary)] data-[state=selected]:bg-card/50 transition-all duration-50"
                      :data-state="row.getIsSelected() ? 'selected' : undefined"
                      @click="openEntryEditor(row.original.id)"
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
                  <CmsEntryContextMenuContent
                    :entry="row.original"
                    @open="openEntryEditor(row.original.id)"
                    @duplicate="duplicateEntries(row.original)"
                    @publish="publishEntries(row.original)"
                    @unpublish="unpublishEntries(row.original)"
                    @archive="archiveEntries(row.original)"
                    @delete="requestDeleteEntries(row.original)"
                    @copy-id="copyEntryId(row.original.id)"
                  />
                </ContextMenu>
              </TableBody>
            </Table>
          </div>

          <div
            v-else
            class="grid min-w-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-7 p-7"
          >
            <ContextMenu v-for="entry in rows" :key="entry.id">
              <ContextMenuTrigger as-child>
                <CmsEntryGridCard
                  :entry="entry"
                  :cover-supported="supportsCover"
                  @open="openEntryEditor"
                  @duplicate="duplicateEntries(entry)"
                  @publish="publishEntries(entry)"
                  @unpublish="unpublishEntries(entry)"
                  @archive="archiveEntries(entry)"
                  @delete="requestDeleteEntries(entry)"
                />
              </ContextMenuTrigger>
              <CmsEntryContextMenuContent
                :entry="entry"
                @open="openEntryEditor(entry.id)"
                @duplicate="duplicateEntries(entry)"
                @publish="publishEntries(entry)"
                @unpublish="unpublishEntries(entry)"
                @archive="archiveEntries(entry)"
                @delete="requestDeleteEntries(entry)"
                @copy-id="copyEntryId(entry.id)"
              />
            </ContextMenu>
          </div>
        </div>

        <div
          v-if="totalPages > 1"
          class="px-8 py-4 border-t border-dashed border-border bg-background flex items-center justify-between text-2xs text-muted-foreground"
        >
          <span>{{
            t("cms.entries.pageOf", { page, total: totalPages })
          }}</span>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="page <= 1"
              @click="setPage(page - 1)"
            >
              {{ t("cms.entryPicker.previous") }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="page >= totalPages"
              @click="setPage(page + 1)"
            >
              {{ t("cms.entryPicker.next") }}
            </Button>
          </div>
        </div>
        <div
          v-else
          class="px-8 py-4 border-t border-dashed border-border bg-background text-2xs text-muted-foreground"
        >
          {{ t("cms.entries.countInCollection", { count: total }) }}
        </div>
      </div>
    </div>

    <div v-else-if="collection" class="min-h-0 flex-1 overflow-auto">
      <div
        class="mx-auto grid w-full max-w-[85rem] gap-8 px-5 py-6 md:px-7 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-10"
      >
        <div class="min-w-0 space-y-8">
          <CollectionSettingsPanel
            :collection="collection"
            embedded
            @updated="handleCollectionConfigured"
          />
          <Collapsible
            v-model:open="isAdvancedSettingsOpen"
            class="border-t border-border/60 pt-6"
          >
            <CollapsibleTrigger as-child>
              <button
                type="button"
                class="flex w-full items-center justify-between gap-4 text-left"
              >
                <span>
                  <span class="block text-sm font-medium text-foreground">
                    Advanced
                  </span>
                  <span class="mt-1 block text-xs leading-5 text-muted-foreground">
                    Configure per-user collection access.
                  </span>
                </span>
                <span
                  :class="[
                    isAdvancedSettingsOpen
                      ? studioIcons.chevronUp
                      : studioIcons.chevronDown,
                    'size-4 text-muted-foreground',
                  ]"
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent class="pt-6">
              <CollectionAccessPolicyPanel :collection="collection" />
            </CollapsibleContent>
          </Collapsible>
          <CmsCommentModerationPanel :collection="collection" />
          <section
            class="grid gap-4 border-t border-border/60 pt-6"
            data-testid="delete-collection-section"
          >
            <div class="grid gap-2">
              <p class="m-0 text-sm font-medium text-foreground">
                {{ t("collections.settings.deleteTitle") }}
              </p>
              <p class="m-0 text-xs text-muted-foreground">
                {{ t("collections.settings.deleteDescription") }}
              </p>
            </div>
            <div>
              <Button
                variant="destructive"
                size="sm"
                class="h-9!"
                :disabled="!canDeleteCollection"
                :title="
                  canDeleteCollection
                    ? t('collections.settings.deleteTitle')
                    : getForbiddenMessage('cms.collections.remove')
                "
                @click="isDeleteCollectionDialogOpen = true"
              >
                {{ t("collections.settings.deleteTitle") }}
              </Button>
            </div>
          </section>
        </div>

        <aside class="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <CollectionSchemaPanel
            :collection="collection"
            embedded
            @updated="handleCollectionConfigured"
          />
        </aside>
      </div>
    </div>

    <DeleteEntryDialog
      :open="isDeleteEntryDialogOpen"
      :title="deleteEntryDialogTitle"
      :count="entriesPendingDelete.length"
      :is-deleting="entryActions.isDeleting.value"
      @update:open="handleDeleteEntryDialogOpen"
      @confirm="confirmDeleteEntries"
    />
    <DeleteCollectionDialog
      v-if="collection"
      :open="isDeleteCollectionDialogOpen"
      :collection="collection"
      @update:open="isDeleteCollectionDialogOpen = $event"
      @deleted="handleCollectionDeleted"
    />
  </div>
</template>

<style scoped>
:deep(th[data-column-id="select"]),
:deep(td[data-column-id="select"]) {
  width: 40px !important;
  max-width: 40px !important;
  min-width: 40px !important;
  padding-left: 8px !important;
  padding-right: 8px !important;
}
</style>
