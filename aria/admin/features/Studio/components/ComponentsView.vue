<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, ref, watch } from "vue";
import { z } from "zod";
import { toast } from "vue-sonner";
import { FlexRender } from "@tanstack/vue-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  useBuilderData,
  type Component,
} from "@/composables/useBuilderData";
import { useStudioRouter } from "@/features/Studio/core/composables";
import {
  clearRowSelection,
  resolveBulkTargets,
  useDialogState,
  useInlineRename,
  useSelectedIds,
} from "@/features/Studio/core/composables";
import {
  BulkSelectionToolbar,
  DeleteConfirmDialog,
  EmptyState,
  ExpandableSearchInput,
  FilterIconMenu,
  SkeletonTable,
  StudioLeftRailReveal,
  StudioPanelShell,
  StudioTableColGroup,
  StudioTableHeader,
} from "@/features/Studio/core/components";
import { useStudioActions } from "@/features/Studio/composer/composables/useStudioActions";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import {
  useComponentGrouping,
  useComponentsListState,
  useComponentsOrganizeState,
  useComponentsTable,
  useCreateComponentDialog,
  useComponentThumbnailActions,
  type ComponentsSort,
  type ComponentsSortKey,
} from "./composables";
import HeaderActionDropdownTooltip from "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue";
import StudioTableColumnMenu from "@/features/Studio/core/components/StudioTableColumnMenu.vue";
import {
  markComponentThumbnailStale,
} from "./composables/componentThumbnailInvalidation";
import {
  ComponentGridCard,
  ComponentsContextMenuContent,
  ComponentsOrganizerRail,
} from "./components";
import {
  getStudioTableColWidthStyle,
  toStudioTableHeaderTable,
} from "@/features/Studio/core/lib/studioTableHeader";
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
import { studioIcons } from "@/lib/icons";
import { isUserComponent } from "./lib/isUserComponent";
import { useStudioI18n } from "@/i18n";
import {
  ComponentsRouteFilterSchema,
  toGroupRouteFilter,
} from "./lib/componentsRouteFilter";
import "@/features/Studio/core/styles/organizer-drag-ghost.css";

defineOptions({ name: "ComponentsView" });

const ViewModeSchema = z.enum(["table", "grid"]);
const VIEW_MODE_KEY = "aria:components:view-mode";
const GRID_SORT_KEY = "aria:components:grid-sort";
const { t } = useStudioI18n();
const componentSortOptions = computed<Array<{ label: string; value: ComponentsSort }>>(() => [
  { label: t("components.sort.nameAsc"), value: { key: "name", direction: "asc" } },
  { label: t("components.sort.nameDesc"), value: { key: "name", direction: "desc" } },
  { label: t("components.sort.recent"), value: { key: "updated", direction: "desc" } },
  { label: t("components.sort.oldest"), value: { key: "updated", direction: "asc" } },
  { label: t("components.sort.idAsc"), value: { key: "id", direction: "asc" } },
  { label: t("components.sort.idDesc"), value: { key: "id", direction: "desc" } },
  { label: t("components.sort.categoryAsc"), value: { key: "category", direction: "asc" } },
  { label: t("components.sort.categoryDesc"), value: { key: "category", direction: "desc" } },
  { label: t("components.sort.originAsc"), value: { key: "source", direction: "asc" } },
]);

function parseComponentsSort(value: unknown): ComponentsSort {
  const fallback: ComponentsSort = { key: "name", direction: "asc" };
  if (
    value === "name" ||
    value === "id" ||
    value === "category" ||
    value === "source" ||
    value === "updated"
  ) {
    return { key: value, direction: value === "updated" ? "desc" : "asc" };
  }

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as { key?: unknown; direction?: unknown };
  const key = record.key;
  const direction = record.direction;
  const validKey: ComponentsSortKey | null = (
    key === "name" ||
    key === "id" ||
    key === "category" ||
    key === "source" ||
    key === "updated"
  ) ? key : null;
  const validDirection = (
    direction === "asc" ||
    direction === "desc"
  ) ? direction : null;

  return validKey && validDirection
    ? { key: validKey, direction: validDirection }
    : fallback;
}

function loadGridSort(): ComponentsSort {
  if (typeof window === "undefined") {
    return parseComponentsSort(null);
  }
  try {
    return parseComponentsSort(
      JSON.parse(window.localStorage.getItem(GRID_SORT_KEY) ?? "null"),
    );
  } catch {
    return parseComponentsSort(window.localStorage.getItem(GRID_SORT_KEY));
  }
}

const {
  components,
  isLoading,
  isReady,
  refreshComponentsNow,
  applyOptimisticComponentRemoval,
} = useBuilderData();
const router = useStudioRouter();
const actions = useStudioActions();
const thumbnailActions = useComponentThumbnailActions();
const deleteDialog = useDialogState();
const deleteTargets = ref<string[]>([]);
const createComponentDialog = useCreateComponentDialog();
const dragState = useStudioOrganizerDragState();

const {
  canCreatePage,
  canDeletePage,
  canEditItemInComposer,
  composerOperationForItem,
  getForbiddenMessage,
} = useStudioCapabilities();

const canEditInComposer = computed(() => canEditItemInComposer("component"));

const userComponents = computed(() => components.value.filter(isUserComponent));

const grouping = useComponentGrouping(userComponents);
const organizeState = useComponentsOrganizeState();

const customGroupOptions = computed(() => grouping.customGroups.value);

const listState = useComponentsListState(components, {
  activeFilter: organizeState.activeFilter,
  groupedSections: grouping.groupedComponents,
  buildEffectiveAssignments: grouping.buildEffectiveAssignments,
  getGroupMemberCount: grouping.getGroupMemberCount,
  customGroupOptions,
});

listState.sortBy.value = loadGridSort();

const showOrganizerRail = computed(() => grouping.canReadGrouping.value);

const groupCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const group of grouping.customGroups.value) {
    counts[group.id] = grouping.getGroupMemberCount(
      group.id,
      listState.userComponents.value,
    );
  }
  return counts;
});

function loadViewMode(): "table" | "grid" {
  if (typeof window === "undefined") {
    return "table";
  }
  const parsed = ViewModeSchema.safeParse(
    window.localStorage.getItem(VIEW_MODE_KEY),
  );
  if (!parsed.success) {
    return "table";
  }
  return parsed.data;
}

const viewMode = ref<"table" | "grid">(loadViewMode());
const collapsedGroups = ref<Record<string, boolean>>({});

function toggleView(): void {
  viewMode.value = viewMode.value === "table" ? "grid" : "table";
  if (typeof window !== "undefined") {
    window.localStorage.setItem(VIEW_MODE_KEY, viewMode.value);
  }
}

function isGroupCollapsed(groupKey: string): boolean {
  return collapsedGroups.value[groupKey] === true;
}

function toggleGroupCollapse(groupKey: string): void {
  collapsedGroups.value = {
    ...collapsedGroups.value,
    [groupKey]: !isGroupCollapsed(groupKey),
  };
}

const inlineRename = useInlineRename<string>({
  commitRename: async (componentId, title) => {
    await actions.renameComponent(componentId, title);
  },
});

const { table, rowSelection } = useComponentsTable({
  data: listState.tableData,
  inlineRename,
});

const reorderableColumns = computed(() =>
  table.getAllLeafColumns().filter((column) => column.id !== "select"),
);

const selectedComponentIds = useSelectedIds(
  table,
  (row) => row.id,
  rowSelection,
);

const tableDisplaySections = computed(() => {
  const sortedRows = table.getRowModel().rows;

  return listState.displaySections.value
    .map((section) => {
      const sectionIds = new Set(section.items.map((item) => item.id));
      const items = sortedRows
        .filter((row) => sectionIds.has(row.original.id))
        .map((row) => ({
          component: row.original,
          row,
        }));

      return {
        ...section,
        items,
      };
    })
    .filter((section) => section.items.length > 0);
});

onActivated(() => {
  void thumbnailActions.refreshStaleComponentThumbnails();
});

onBeforeUnmount(() => {
  endOrganizerDragGhost();
  dragState.endDrag();
});

function handleFilter(filter: string): void {
  const parsed = ComponentsRouteFilterSchema.safeParse(filter);
  if (parsed.success) {
    organizeState.setActiveFilter(parsed.data);
  }
}

function handleSearch(value: string | number): void {
  listState.searchQuery.value = String(value);
}

function handleSort(nextSort: ComponentsSort): void {
  const parsed = parseComponentsSort(nextSort);
  listState.sortBy.value = parsed;
  listState.currentPage.value = 1;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(GRID_SORT_KEY, JSON.stringify(parsed));
  }
}

function onColumnReorder(columns = reorderableColumns.value): void {
  const newOrder = columns.map((column) => column.id);
  const allIds = table.getAllLeafColumns().map((column) => column.id);
  const fixedIds = allIds.filter((id) => !newOrder.includes(id));
  table.setColumnOrder([...fixedIds, ...newOrder]);
}

function handleOpen(componentId: string): void {
  router.navigateTo(`/components/${componentId}`);
}

function handleCreate(): void {
  if (!canCreatePage.value) {
    toast.error(getForbiddenMessage("crud.createItem"));
    return;
  }
  createComponentDialog.open();
}

function handleEditInComposer(componentId: string): void {
  if (!canEditInComposer.value) {
    const operation = composerOperationForItem("component");
    toast.error(getForbiddenMessage(operation));
    return;
  }
  router.startEditing("component", componentId);
}

function confirmDelete(componentId?: string): void {
  if (!canDeletePage.value) {
    toast.error(getForbiddenMessage("crud.deleteItem"));
    return;
  }
  const targets = resolveBulkTargets(componentId, selectedComponentIds.value);
  if (targets.length === 0) return;
  deleteTargets.value = targets;
  deleteDialog.open();
}

async function handleDeleteConfirm(): Promise<void> {
  if (deleteTargets.value.length === 0) {
    return;
  }

  if (deleteTargets.value.length > 1) {
    const queue = [...deleteTargets.value];
    const total = queue.length;

    deleteTargets.value = [];
    deleteDialog.close();
    clearRowSelection(rowSelection);

    const rollback = applyOptimisticComponentRemoval(queue);

    void actions
      .deleteComponentsBatch(queue, { silent: true })
      .then(async (result) => {
        if (result.succeeded === 0) {
          rollback();
        }

        if (result.failed === 0) {
          toast.success(
            result.succeeded === 1
              ? "Component deleted"
              : `${result.succeeded} components deleted`,
          );
        } else if (result.succeeded > 0) {
          toast.error(`Deleted ${result.succeeded} of ${total} components`);
        } else {
          toast.error(`Failed to delete ${total} components`);
        }

        await refreshComponentsNow();
      });
    return;
  }

  const componentId = deleteTargets.value[0]!;
  const ok = await actions.deleteComponent(componentId, { silent: true });

  deleteDialog.close();
  deleteTargets.value = [];
  clearRowSelection(rowSelection);

  if (ok) {
    toast.success("Component deleted");
    await refreshComponentsNow();
  }
}

async function duplicateTargets(componentId?: string): Promise<void> {
  const targets = resolveBulkTargets(componentId, selectedComponentIds.value);
  if (targets.length === 0) return;

  let duplicatedCount = 0;
  for (const target of targets) {
    const result = await actions.duplicateComponent(target);
    if (result) {
      markComponentThumbnailStale(result);
      duplicatedCount++;
    }
  }

  clearRowSelection(rowSelection);
  if (duplicatedCount > 0) {
    toast.success(
      duplicatedCount === 1
        ? "Component duplicated"
        : `${duplicatedCount} components duplicated`,
    );
    await refreshComponentsNow();
  }
}

function explicitGroupId(componentId: string): string | undefined {
  return grouping.componentGroupAssignments.value[componentId];
}

function getComponentDragLabel(componentId: string, itemCount: number): string {
  if (itemCount > 1) {
    return `${itemCount} components`;
  }

  const component = listState.userComponents.value.find(
    (item) => item.id === componentId,
  );
  return component?.name || componentId;
}

function resolveDragSourceElement(event: DragEvent): HTMLElement | null {
  const current = event.currentTarget;
  if (!(current instanceof HTMLElement)) {
    return null;
  }

  if (viewMode.value === "table") {
    const row = current.closest('tr[data-slot="table-row"]');
    if (row instanceof HTMLElement) {
      return row;
    }
  }

  return current;
}

function handleDragStart(componentId: string, event: DragEvent): void {
  if (!grouping.canUpdateGrouping.value) {
    return;
  }

  const ids =
    viewMode.value === "table"
      ? resolveBulkTargets(componentId, selectedComponentIds.value)
      : [componentId];

  dragState.startDrag(componentId, ids);
  event.dataTransfer?.setData("text/plain", componentId);
  if (ids.length > 1) {
    event.dataTransfer?.setData(ORGANIZER_DRAG_IDS_MIME, JSON.stringify(ids));
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    if (viewMode.value === "table") {
      event.dataTransfer.setData("text/html", " ");
    }
  }

  const dragOptions = {
    itemCount: ids.length,
    source: resolveDragSourceElement(event),
    compactLabel: getComponentDragLabel(componentId, ids.length),
    onDragEnd: handleOrganizerDragEnd,
  };

  if (viewMode.value === "table") {
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

async function handleMoveToGroup(
  componentId: string,
  groupId?: string,
): Promise<void> {
  await grouping.moveComponentToGroup(componentId, groupId);
}

async function handleMoveItemsToGroup(
  componentIds: readonly string[],
  groupId?: string,
): Promise<void> {
  for (const componentId of componentIds) {
    await grouping.moveComponentToGroup(componentId, groupId);
  }
}

async function handleCreateGroup(name: string): Promise<void> {
  await grouping.createCustomGroup(name);
}

async function handleRenameGroup(groupId: string, name: string): Promise<void> {
  await grouping.renameCustomGroup(groupId, name);
}

async function handleDeleteGroup(groupId: string): Promise<void> {
  const wasActive =
    organizeState.activeFilter.value === toGroupRouteFilter(groupId);
  await grouping.deleteCustomGroup(groupId);
  if (wasActive) {
    organizeState.setActiveFilter("all");
  }
}

function handleSelectAll(): void {
  organizeState.setActiveFilter("all");
}

function handleSelectGroup(groupId: string): void {
  organizeState.setActiveFilter(toGroupRouteFilter(groupId));
}

</script>

<template>
  <StudioPanelShell
    variant="rail"
    content-class="bg-background"
  >
    <template #rail>
      <StudioLeftRailReveal v-if="showOrganizerRail">
        <ComponentsOrganizerRail
          v-memo="[
            grouping.customGroups.value,
            groupCounts,
            listState.userComponents.value.length,
            organizeState.activeFilter.value,
            grouping.canUpdateGrouping.value,
          ]"
          :groups="grouping.customGroups.value"
          :group-counts="groupCounts"
          :all-count="listState.userComponents.value.length"
          :active-filter="organizeState.activeFilter.value"
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
        <div class="min-w-0 select-none">
          <h1 class="truncate text-xl font-serif font-medium tracking-tight">
            {{
              showOrganizerRail
                ? listState.activeFilterLabel.value
                : t("components.title")
            }}
          </h1>
        </div>

        <div
          class="flex min-w-0 shrink-0 items-center justify-end gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_[data-slot=button]:hover]:z-10 [&_[data-slot=button]:focus-visible]:z-10 [&_[data-slot=button][data-state=open]]:z-10"
        >
          <BulkSelectionToolbar
            v-if="selectedComponentIds.length > 0"
            :count="selectedComponentIds.length"
            entity-label="component"
            @duplicate="duplicateTargets()"
            @delete="confirmDelete()"
          />
          <template v-else>
            <ExpandableSearchInput
              :model-value="listState.searchQuery.value"
              :placeholder="t('components.search')"
              @update:model-value="handleSearch"
            />
            <FilterIconMenu
              :model-value="organizeState.activeFilter.value"
              :filters="listState.builtinFilterOptions.value"
              :sections="listState.groupFilterSections.value"
              :active-label="listState.activeFilterLabel.value"
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
                <DropdownMenuContent align="end" class="w-40">
                  <DropdownMenuItem
                    v-for="option in componentSortOptions"
                    :key="`${option.value.key}:${option.value.direction}`"
                    class="cursor-pointer text-xs"
                    @select.prevent="handleSort(option.value)"
                  >
                    <span
                      v-if="
                        option.value.key === listState.sortBy.value.key &&
                        option.value.direction ===
                          listState.sortBy.value.direction
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
              :locked-column-ids="['name']"
              @reorder="onColumnReorder"
            />
            <Button
              variant="headerAction"
              size="icon-header"
              :title="viewMode === 'table' ? t('components.gridView') : t('components.tableView')"
              @click="toggleView"
            >
              <span
                v-if="viewMode === 'grid'"
                :class="[studioIcons.list, 'size-3.5 shrink-0']"
              />
              <span v-else :class="[studioIcons.grid, 'size-3.5 shrink-0']" />
            </Button>
            <Button
              v-if="canCreatePage"
              variant="default"
              size="md"
              class="ml-2"
              @click="handleCreate"
            >
              {{ t("components.new") }}
            </Button>
          </template>
        </div>
      </header>

      <div
        class="page-card-enter flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-y-none px-0 pb-7 bg-background rounded-b-md [overflow-anchor:none]"
        style="touch-action: pan-y"
      >
        <SkeletonTable
          v-if="isLoading && !isReady"
          :rows="6"
          :columns="table.getVisibleLeafColumns().length"
        />

        <EmptyState
          v-else-if="listState.filteredComponents.value.length === 0"
          :icon="studioIcons.component"
          entity-label="components"
          entity-label-singular="component"
          :description="
            listState.searchQuery.value.trim()
              ? t('components.emptySearch')
              : undefined
          "
          :hide-action="!canCreatePage"
          @create="handleCreate"
        />

        <template v-else>
          <div v-if="viewMode === 'table'" class="rounded-none bg-background">
            <StudioTableHeader
              :table="toStudioTableHeaderTable(table)"
              :get-head-cell-class="() => 'px-5'"
            />
            <Table class="w-full border-collapse table-fixed">
              <StudioTableColGroup :table="toStudioTableHeaderTable(table)" />
              <TableBody>
                <template
                  v-for="group in tableDisplaySections"
                  :key="group.key"
                >
                  <TableRow
                    v-if="group.label"
                    class="bg-muted/30 hover:bg-muted/30"
                  >
                    <TableCell
                      class="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      :colspan="table.getVisibleLeafColumns().length"
                    >
                      <button
                        type="button"
                        class="inline-flex items-center gap-2"
                        @click="toggleGroupCollapse(group.key)"
                      >
                        <span
                          :class="[
                            isGroupCollapsed(group.key)
                              ? studioIcons.chevronRight
                              : studioIcons.chevronDown,
                            'size-3.5',
                          ]"
                        />
                        {{ group.label }}
                        <span class="text-2xs text-muted-foreground/70">
                          ({{ group.items.length }})
                        </span>
                      </button>
                    </TableCell>
                  </TableRow>

                  <ContextMenu
                    v-for="item in group.items"
                    v-if="!group.label || !isGroupCollapsed(group.key)"
                    :key="item.component.id"
                  >
                    <ContextMenuTrigger as-child>
                      <TableRow
                        class="cursor-pointer border-b border-border! border-dashed transition-all duration-50 group hover:card/50 hover:[box-shadow:inset_2px_0_0_0_var(--primary),inset_-2px_0_0_0_var(--primary)] data-[state=selected]:bg-card/50"
                        :class="
                          grouping.canUpdateGrouping.value
                            ? 'cursor-grab active:cursor-grabbing'
                            : ''
                        "
                        :draggable="grouping.canUpdateGrouping.value"
                        :data-state="
                          item.row.getIsSelected()
                            ? 'selected'
                            : undefined
                        "
                        @click="handleOpen(item.component.id)"
                        @dragstart="handleDragStart(item.component.id, $event)"
                      >
                        <TableCell
                          v-for="cell in item.row.getVisibleCells()"
                          :key="cell.id"
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
                    <ComponentsContextMenuContent
                      :component="item.component"
                      :can-edit-in-composer="canEditInComposer"
                      :can-update-grouping="grouping.canUpdateGrouping.value"
                      :custom-groups="grouping.customGroups.value"
                      :current-group-id="explicitGroupId(item.component.id) ?? null"
                      @open="handleOpen(item.component.id)"
                      @edit-in-composer="handleEditInComposer(item.component.id)"
                      @rename="
                        inlineRename.startRename(
                          item.component.id,
                          item.component.name || item.component.id,
                        )
                      "
                      @duplicate="duplicateTargets(item.component.id)"
                      @delete="confirmDelete(item.component.id)"
                      @move-to-group="handleMoveToGroup(item.component.id, $event)"
                    />
                  </ContextMenu>
                </template>
              </TableBody>
            </Table>
          </div>

          <div v-else class="space-y-8">
            <section
              v-for="group in listState.displaySections.value"
              :key="group.key"
              class="space-y-3"
            >
              <div
                v-if="group.label"
                class="sticky top-0 z-20 flex items-center gap-3 border-b border-dashed border-border bg-background pb-0"
              >
                <h3
                  class="text-sm font-semibold uppercase tracking-wide text-muted-foreground pl-7"
                >
                  {{ group.label }}
                </h3>
                <span class="text-2xs text-muted-foreground/70 tabular-nums select-none pr-7">
                  {{ group.items.length }}
                </span>
              </div>
              <div
                class="grid grid-cols-1 gap-7 p-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
              >
                <ContextMenu
                  v-for="component in group.items"
                  :key="component.id"
                >
                  <ContextMenuTrigger as-child>
                    <ComponentGridCard
                      :component="component"
                      :is-thumbnail-pending="
                        thumbnailActions.isComponentThumbnailPending(component.id)
                      "
                      :thumbnail-refresh-token="
                        thumbnailActions.getComponentThumbnailRefreshToken(
                          component.id,
                        )
                      "
                      :is-renaming="
                        inlineRename.editingId.value === component.id
                      "
                      :editing-title="inlineRename.editingValue.value"
                      :can-edit-in-composer="canEditInComposer"
                      :draggable="grouping.canUpdateGrouping.value"
                      @open="handleOpen(component.id)"
                      @edit-in-composer="handleEditInComposer(component.id)"
                      @rename="
                        inlineRename.startRename(
                          component.id,
                          component.name || component.id,
                        )
                      "
                      @duplicate="duplicateTargets(component.id)"
                      @delete="confirmDelete(component.id)"
                      @update-editing-title="
                        inlineRename.editingValue.value = $event
                      "
                      @confirm-rename="inlineRename.confirmRename()"
                      @cancel-rename="inlineRename.cancelRename()"
                      @rename-keydown="inlineRename.handleRenameKeydown"
                      @dragstart="handleDragStart(component.id, $event)"
                    />
                  </ContextMenuTrigger>
                  <ComponentsContextMenuContent
                    :component="component"
                    :can-edit-in-composer="canEditInComposer"
                    :can-update-grouping="grouping.canUpdateGrouping.value"
                    :custom-groups="grouping.customGroups.value"
                    :current-group-id="explicitGroupId(component.id) ?? null"
                    @open="handleOpen(component.id)"
                    @edit-in-composer="handleEditInComposer(component.id)"
                    @rename="
                      inlineRename.startRename(
                        component.id,
                        component.name || component.id,
                      )
                    "
                    @duplicate="duplicateTargets(component.id)"
                    @delete="confirmDelete(component.id)"
                    @move-to-group="handleMoveToGroup(component.id, $event)"
                  />
                </ContextMenu>
              </div>
            </section>
          </div>
        </template>
      </div>

      <div
        v-if="
          listState.showPagination.value &&
          listState.totalPages.value > 1 &&
          !isLoading
        "
        class="flex h-10 shrink-0 items-center justify-end border-t border-border/50 border-dashed bg-background inset-shadow-xs px-7 select-none"
      >
        <span class="text-2xs text-muted-foreground tabular-nums">
          {{ listState.currentPage.value }} / {{ listState.totalPages.value }}
        </span>
        <div class="flex items-center gap-0 pl-6">
          <Button
            variant="ghost"
            size="icon"
            class="text-muted-foreground hover:text-foreground"
            :disabled="listState.currentPage.value <= 1"
            @click="listState.currentPage.value--"
          >
            <span :class="[studioIcons.chevronLeft, 'size-4']" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="text-muted-foreground hover:text-foreground"
            :disabled="
              listState.currentPage.value >= listState.totalPages.value
            "
            @click="listState.currentPage.value++"
          >
            <span :class="[studioIcons.chevronRight, 'size-4']" />
          </Button>
        </div>
      </div>
  </StudioPanelShell>

  <DeleteConfirmDialog
      :open="deleteDialog.isOpen.value"
      :title="
        deleteTargets.length > 1
          ? t('components.dialog.deleteSelectedTitle')
          : t('components.dialog.deleteTitle')
      "
      :description="
        deleteTargets.length > 1
          ? t('components.dialog.deleteSelectedDescription', { count: deleteTargets.length })
          : t('components.dialog.deleteDescription')
      "
      :item-name="deleteTargets.length === 1 ? deleteTargets[0] : undefined"
      @update:open="
        deleteDialog.isOpen.value ? deleteDialog.close() : deleteDialog.open()
      "
      @confirm="handleDeleteConfirm"
    />
</template>
