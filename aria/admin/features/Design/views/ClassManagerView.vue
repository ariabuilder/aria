<script setup lang="ts">
import { FlexRender } from "@tanstack/vue-table";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableRow,
} from "@/components/ui/table";
import ClassCssEditorDialog from "../components/ClassCssEditorDialog.vue";
import ClassManagerNameDialog from "../dialogs/ClassManagerNameDialog.vue";
import DesignAssetImportDialog from "../dialogs/DesignAssetImportDialog.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClassManagerInventory } from "../composables/useClassManagerInventory";
import { useClassEditor } from "@/features/Inspector/composables/useClassEditor";
import { useInlineRename } from "@/features/Studio/core/composables/useInlineRename";
import { useClassManagerTable } from "../composables/useClassManagerTable";
import {
  buildClassSelectorPreview,
  formatClassCssText,
  formatClassManagerCssText,
} from "../lib/classManagerCss";
import { createSequentialDuplicateKey } from "../lib/variableManagerKeys";
import type { ClassManagerRow } from "../lib/classManagerTable";
import type { CustomClass } from "../../../../lib/schemas/classEditor";
import { BREAKPOINT_WIDTHS } from "../../../../lib/schemas/classEditor";
import {
  generateCustomClasses,
  generateKeyframesCSS,
} from "../../../../lib/styles/generateCustomCSS";
import { designTokensState } from "../composables/useDesignTokens";
import type { DesignImportCollisionContext } from "../lib/designImporter";
import { actions } from "astro:actions";
import {
  useSelectedIds,
  clearRowSelection,
  resolveBulkTargets,
} from "@/features/Studio/core/composables";
import {
  DeleteConfirmDialog,
  SearchOrBulkToolbar,
  StudioTableHeader,
  StudioTableColGroup,
  StudioTableColumnMenu,
} from "@/features/Studio/core/components";
import FilterIconMenu from "@/features/Studio/core/components/FilterIconMenu.vue";
import HeaderActionDropdownTooltip from "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import DesignHeaderTeleport from "../components/DesignHeaderTeleport.vue";
import { useDesignWorkbenchHighlightClass } from "../composables/useDesignWorkbenchDialog";
import type { ClassManagerSegment } from "../lib/classManagerTable";
import {
  toStudioTableHeaderTable,
  getStudioTableColWidthStyle,
} from "@/features/Studio/core/lib/studioTableHeader";

type NameDialogState =
  | { mode: "create"; row: null }
  | { mode: "rename"; row: ClassManagerRow }
  | { mode: "duplicate"; row: ClassManagerRow }
  | null;

const nameDialogState = ref<NameDialogState>(null);
const cssDialogRow = ref<ClassManagerRow | null>(null);
const isClearConfirmOpen = ref(false);
const isImportDialogOpen = ref(false);
const isBulkDeleteOpen = ref(false);
const rowsToDelete = ref<ClassManagerRow[]>([]);
const { t } = useStudioI18n();

const {
  rows,
  inventoryError,
  isInventoryLoading,
  isClassEditorLoading,
  availableBreakpoints,
  loadInventory,
  refreshInventory,
  createClass,
  renameClass,
  duplicateClass,
  deleteClass,
  deleteClasses,
  removeOrphanedClassReferences,
  removeOrphanedClassReferencesBatch,
  updateClassCss,
  currentBreakpoint,
} = useClassManagerInventory();

const classEditor = useClassEditor();

const importCollisionContext = computed<DesignImportCollisionContext>(() => ({
  classNames: Object.keys(classEditor.customClasses.value),
  keyframeNames: Object.keys(designTokensState.keyframes),
}));

const exportContextRulesCss = ref("");

const inlineRename = useInlineRename<string>({
  commitRename: async (id, name) => {
    const success = await renameClass(id, name);
    if (!success) throw new Error("Rename failed");
  },
});

const {
  searchQuery,
  activeSegment,
  filters,
  table,
  rowSelection,
  hasActiveFilters,
  setActiveSegment,
} = useClassManagerTable({
  rows,
  inlineRename,
  onEditCss: (row) => {
    if (row.classDefinition === null) {
      return;
    }

    cssDialogSelectedBreakpoint.value = resolveBestBreakpointForClass(
      row.classDefinition,
    );
    cssDialogRow.value = row;
  },
  onRenameClass: (row) => {
    if (row.classDefinition === null) return;
    inlineRename.startRename(row.id, row.name);
  },
  onDuplicateClass: (row) => {
    void confirmDuplicateClasses(row.id);
  },
  onDeleteClass: (row) => {
    confirmDeleteClasses(row.id);
  },
});
const CLASS_MANAGER_LOCKED_COLUMN_IDS = new Set([
  "select",
  "searchText",
  "name",
  "actions",
]);

const reorderableColumns = computed(() =>
  table
    .getAllLeafColumns()
    .filter((column) => !CLASS_MANAGER_LOCKED_COLUMN_IDS.has(column.id ?? "")),
);

function onColumnReorder(columns = reorderableColumns.value) {
  const newOrder = columns
    .map((column) => column.id)
    .filter((id): id is string => Boolean(id));
  table.setColumnOrder(["select", "searchText", "name", ...newOrder, "actions"]);
}

const selectedIds = useSelectedIds(table, (row) => row.id, rowSelection);
const selectionIncludesOrphaned = computed(() => {
  return resolveSelectedRows(selectedIds.value).some(
    (row) => row.status === "orphaned",
  );
});

const isPageLoading = computed(
  () => isInventoryLoading.value || isClassEditorLoading.value,
);
const tableRows = computed(() => table.getRowModel().rows);
const visibleColumnCount = computed(() => table.getVisibleLeafColumns().length);
const emptyStateLabel = computed(() => {
  if (rows.value.length === 0) {
    return t("design.classes.empty.noCustom");
  }

  if (hasActiveFilters.value) {
    return t("design.classes.empty.noMatches");
  }

  return t("design.classes.empty.noAvailable");
});
const isNameDialogOpen = computed(() => nameDialogState.value !== null);
const dialogTitleRow = computed(() => nameDialogState.value?.row ?? null);
const nameDialogInitialCss = computed(() => {
  const row = nameDialogState.value?.row;
  if (!row?.classDefinition) {
    return "";
  }
  return formatClassManagerCssText(
    row.classDefinition,
    currentBreakpoint.value,
  );
});
const cssDialogSelectedBreakpoint = ref("base");
const isCssDialogOpen = computed(() => cssDialogRow.value !== null);
const cssDialogInitialValue = computed(() => {
  if (!cssDialogRow.value?.classDefinition) {
    return "";
  }

  return formatClassCssText(cssDialogRow.value.classDefinition, {
    breakpoint: cssDialogSelectedBreakpoint.value,
    pseudoState: "default",
  });
});

const cssDialogSelectorPreview = computed(() => {
  if (!cssDialogRow.value?.name) {
    return "";
  }

  return buildClassSelectorPreview(cssDialogRow.value.name, "default");
});

function resolveBestBreakpointForClass(classDef: CustomClass): string {
  // Prefer the current viewport breakpoint if it has CSS
  const currentBp = currentBreakpoint.value;
  if (
    classDef.variants.some(
      (v) => v.breakpoint === currentBp && v.rules.length > 0,
    )
  ) {
    return currentBp;
  }
  // Fall back to the first breakpoint that has CSS
  const firstWithCss = classDef.variants.find((v) => v.rules.length > 0);
  if (firstWithCss) {
    return firstWithCss.breakpoint;
  }
  return currentBp;
}

function handleNameDialogOpenChange(value: boolean): void {
  if (!value) {
    nameDialogState.value = null;
  }
}

function handleCssDialogOpenChange(value: boolean): void {
  if (!value) {
    cssDialogRow.value = null;
  }
}

function getRowElementId(row: ClassManagerRow): string {
  return `class-row-${row.name}`;
}

function handleRowDblClick(row: ClassManagerRow): void {
  if (row.classDefinition === null) {
    return;
  }

  cssDialogSelectedBreakpoint.value = resolveBestBreakpointForClass(
    row.classDefinition,
  );
  cssDialogRow.value = row;
}

function getHeadCellClass(columnId: string): string | undefined {
  switch (columnId) {
    case "name":
      return "px-5";
    case "actions":
      return "text-right";
    default:
      return "px-3";
  }
}

function getBodyCellClass(columnId: string): string {
  switch (columnId) {
    case "select":
      return "px-3 py-2 align-middle";
    case "name":
      return "min-w-0 overflow-hidden px-5 py-2 align-middle";
    case "css":
      return "px-3 py-2 align-middle whitespace-nowrap";
    case "actions":
      return "min-w-0 overflow-hidden py-2 pr-3 align-middle text-right transition-colors group-hover:bg-card/18";
    default:
      return "min-w-0 overflow-hidden px-3 py-2 align-middle";
  }
}

async function jumpToRow(rowId: string | null): Promise<void> {
  if (!rowId || typeof document === "undefined") {
    return;
  }

  await nextTick();

  const row = document.getElementById(rowId);
  row?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function openCreateDialog(): void {
  nameDialogState.value = { mode: "create", row: null };
}

function resolveSelectedRows(ids: readonly string[]): ClassManagerRow[] {
  return ids
    .map((id) => rows.value.find((row) => row.id === id))
    .filter((row): row is ClassManagerRow => row !== undefined);
}

function confirmDeleteClasses(rowId?: string): void {
  const ids = resolveBulkTargets(rowId, selectedIds.value);
  const targets = resolveSelectedRows(ids);
  if (targets.length === 0) {
    return;
  }

  rowsToDelete.value = targets;
  isBulkDeleteOpen.value = true;
}

async function executeDeleteClasses(): Promise<void> {
  const targets = [...rowsToDelete.value];
  if (targets.length === 0) {
    return;
  }

  // Partition: classes with a definition, and classes that are only references
  const definedClasses = targets.filter((row) => row.classDefinition !== null);
  const orphanedClasses = targets.filter((row) => row.classDefinition === null);

  // Collect all location-cleanup groups: orphaned classes, plus defined classes
  // that also have usage references (so they don't reappear as orphaned)
  const locationCleanupGroups: Array<{
    className: string;
    locations: readonly ClassManagerUsageLocation[];
  }> = orphanedClasses.map((row) => ({
    className: row.name,
    locations: row.locations,
  }));

  for (const row of definedClasses) {
    if (row.locations.length > 0) {
      locationCleanupGroups.push({
        className: row.name,
        locations: row.locations,
      });
    }
  }

  let succeeded = 0;
  let failed = 0;

  // Batch delete defined classes — single backend round-trip
  if (definedClasses.length > 0) {
    const names = definedClasses.map((row) => row.name);
    const result = await deleteClasses(names);
    succeeded += result.succeeded;
    failed += result.failed;
  }

  // Batch remove references — concurrent per-document calls
  if (locationCleanupGroups.length > 0) {
    const result = await removeOrphanedClassReferencesBatch(
      locationCleanupGroups,
    );
    succeeded += result.succeeded.length;
    failed += result.failed.length;
  }

  clearRowSelection(rowSelection);
  rowsToDelete.value = [];
  isBulkDeleteOpen.value = false;

  if (failed > 0) {
    toast.error(
      t("design.classes.toast.deleteSomeFailed", {
        failed,
        total: targets.length,
      }),
    );
    return;
  }

  toast.success(
    succeeded === 1
      ? t("design.classes.toast.deletedOne", { count: succeeded })
      : t("design.classes.toast.deletedMany", { count: succeeded }),
  );
}

async function confirmDuplicateClasses(rowId?: string): Promise<void> {
  const ids = resolveBulkTargets(rowId, selectedIds.value);
  const targets = resolveSelectedRows(ids).filter(
    (row) => row.classDefinition !== null,
  );
  if (targets.length === 0) {
    return;
  }

  const existingNames = Object.keys(classEditor.customClasses.value);
  const reservedNames = new Set(existingNames);
  let succeeded = 0;
  let lastJumpName: string | null = null;

  for (const row of targets) {
    const nextName = createSequentialDuplicateKey(row.name, [...reservedNames]);
    reservedNames.add(nextName);

    const ok = await duplicateClass(row.name, nextName);
    if (!ok) {
      continue;
    }

    succeeded += 1;
    lastJumpName = nextName;
  }

  clearRowSelection(rowSelection);

  if (succeeded > 0) {
    toast.success(
      succeeded === 1
        ? t("design.classes.toast.duplicatedOne", { count: succeeded })
        : t("design.classes.toast.duplicatedMany", { count: succeeded }),
    );
    if (lastJumpName) {
      await jumpToRow(`class-row-${lastJumpName}`);
    }
  }
}

function clearAllClasses(): void {
  isClearConfirmOpen.value = true;
}

async function confirmClearAllClasses(): Promise<void> {
  isClearConfirmOpen.value = false;
  const classNames = Object.keys(classEditor.customClasses.value);
  if (classNames.length === 0) {
    toast.success(t("design.classes.toast.noClassesToClear"));
    return;
  }

  const result = await deleteClasses(classNames);

  if (result.failed > 0) {
    toast.success(
      t("design.classes.toast.clearedWithFailures", {
        succeeded: result.succeeded,
        failed: result.failed,
      }),
    );
  } else {
    toast.success(
      t("design.classes.toast.cleared", { count: result.succeeded }),
    );
  }
}

async function handleNameDialogSubmit(payload: {
  name: string;
  cssText?: string;
  breakpoint?: string;
}): Promise<void> {
  const dialogState = nameDialogState.value;
  if (!dialogState) {
    return;
  }

  if (dialogState.mode === "create") {
    const success = await createClass(payload.name);
    if (!success) {
      toast.error(t("design.classes.toast.createFailed", { name: payload.name }));
      return;
    }

    if (payload.cssText) {
      const cssSuccess = await updateClassCss(
        payload.name,
        payload.cssText,
        payload.breakpoint,
      );
      if (!cssSuccess) {
        toast.error(
          t("design.classes.toast.createdCssFailed", { name: payload.name }),
        );
        return;
      }
    }

    toast.success(t("design.classes.toast.created", { name: payload.name }));
    nameDialogState.value = null;
    await jumpToRow(`class-row-${payload.name}`);
    return;
  }

  if (dialogState.mode === "rename") {
    const success = await renameClass(dialogState.row.name, payload.name);
    if (!success) {
      toast.error(
        t("design.classes.toast.renameFailed", {
          name: dialogState.row.name,
        }),
      );
      return;
    }

    toast.success(
      t("design.classes.toast.renamed", {
        from: dialogState.row.name,
        to: payload.name,
      }),
    );
    nameDialogState.value = null;
    await jumpToRow(`class-row-${payload.name}`);
    return;
  }

  const success = await duplicateClass(dialogState.row.name, payload.name);
  if (!success) {
    toast.error(
      t("design.classes.toast.duplicateFailed", {
        name: dialogState.row.name,
      }),
    );
    return;
  }

  if (payload.cssText) {
    const cssSuccess = await updateClassCss(
      payload.name,
      payload.cssText,
      payload.breakpoint,
    );
    if (!cssSuccess) {
      toast.error(
        t("design.classes.toast.duplicatedCssFailed", {
          name: dialogState.row.name,
        }),
      );
      return;
    }
  }

  toast.success(
    t("design.classes.toast.duplicatedTo", {
      from: dialogState.row.name,
      to: payload.name,
    }),
  );
  nameDialogState.value = null;
  await jumpToRow(`class-row-${payload.name}`);
}

async function handleCssDialogSubmit(payload: {
  cssText: string;
  breakpoint: string;
}): Promise<void> {
  const row = cssDialogRow.value;
  if (!row) {
    return;
  }

  const success = await updateClassCss(
    row.name,
    payload.cssText,
    payload.breakpoint,
  );
  if (!success) {
    toast.error(
      inventoryError.value ??
        t("design.classes.toast.updateFailed", { name: row.name }),
    );
    return;
  }

  toast.success(t("design.classes.toast.cssUpdated", { name: row.name }));
  cssDialogRow.value = null;
}

function exportClasses(): void {
  const data = classEditor.customClasses.value;
  const count = Object.keys(data).length;
  if (count === 0) {
    toast.success(t("design.classes.toast.noClassesToExport"));
    return;
  }
  // Strip server-managed metadata from export
  const cleanData: Record<string, unknown> = {};
  for (const [name, cls] of Object.entries(data)) {
    const { usageCount, createdAt, updatedAt, ...rest } = cls;
    cleanData[name] = rest;
  }
  const json = JSON.stringify(cleanData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "aria-classes.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(t("design.classes.toast.exportedJson", { count }));
}

async function loadExportContextRules(): Promise<void> {
  try {
    const result = (await actions.styles.getRenderStyles({})) as {
      data?: { contextRulesCSS?: string };
    };
    exportContextRulesCss.value = result.data?.contextRulesCSS?.trim() ?? "";
  } catch {
    exportContextRulesCss.value = "";
  }
}

async function exportClassesAsCss(): Promise<void> {
  const classes = classEditor.customClasses.value;
  const count = Object.keys(classes).length;
  if (
    count === 0 &&
    !exportContextRulesCss.value &&
    Object.keys(designTokensState.keyframes).length === 0
  ) {
    toast.success(t("design.classes.toast.noClassesToExport"));
    return;
  }

  const cssParts = [
    generateCustomClasses(classes, BREAKPOINT_WIDTHS),
    exportContextRulesCss.value,
    generateKeyframesCSS({
      keyframes: Object.fromEntries(
        Object.entries(designTokensState.keyframes).map(([name, steps]) => [
          name,
          { steps },
        ]),
      ),
    }),
  ].filter((part) => part.trim().length > 0);

  const css = cssParts.join("\n\n");
  const blob = new Blob([css], { type: "text/css" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "aria-classes.css";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(t("design.classes.toast.exportedCss"));
}

onMounted(async () => {
  await loadInventory();
  await loadExportContextRules();

  if (inventoryError.value) {
    toast.error(inventoryError.value);
  }
});

const workbenchHighlightClass = useDesignWorkbenchHighlightClass();

watch(
  [
    () => workbenchHighlightClass?.value ?? null,
    isPageLoading,
    () => rows.value.length,
  ],
  async ([className, loading]) => {
    if (!className || loading) {
      return;
    }

    const row = rows.value.find((entry) => entry.name === className);
    if (!row) {
      return;
    }

    await jumpToRow(getRowElementId(row));
  },
  { immediate: true },
);
</script>

<template>
  <DesignHeaderTeleport target="toolbar">
    <FilterIconMenu
      :model-value="activeSegment"
      :filters="filters"
      @update:model-value="setActiveSegment($event as ClassManagerSegment)"
    />
    <StudioTableColumnMenu
      :columns="reorderableColumns"
      @reorder="onColumnReorder"
    />
  </DesignHeaderTeleport>

  <DesignHeaderTeleport target="search">
    <SearchOrBulkToolbar
      :count="selectedIds.length"
      :entity-label="t('design.classes.entity')"
      :search-query="searchQuery"
      :search-placeholder="t('design.classes.searchPlaceholder')"
      :show-duplicate="!selectionIncludesOrphaned"
      @update:search-query="(value) => (searchQuery = value)"
      @duplicate="confirmDuplicateClasses()"
      @delete="confirmDeleteClasses()"
    />
  </DesignHeaderTeleport>

  <DesignHeaderTeleport target="importExport">
    <HeaderActionDropdownTooltip :label="t('design.classes.moreActions')">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="headerAction"
            size="icon-header"
            :aria-label="t('design.classes.moreActions')"
          >
            <span :class="[studioIcons.moreHorizontal, 'size-3.5 shrink-0']" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem @select="isImportDialogOpen = true">
              {{ t("design.classes.menu.import") }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="exportClasses">
              {{ t("design.classes.menu.exportJson") }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="exportClassesAsCss">
              {{ t("design.classes.menu.exportCss") }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="refreshInventory">
              {{ t("design.classes.menu.refresh") }}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" @select="clearAllClasses">
              {{ t("design.classes.menu.clearAll") }}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </HeaderActionDropdownTooltip>
  </DesignHeaderTeleport>

  <DesignHeaderTeleport target="actions">
    <Button variant="default" size="md" @click="openCreateDialog">
      <span class="i-hugeicons:add-01 mr-1.5 size-3.5" />
      {{ t("design.classes.createButton") }}
    </Button>
  </DesignHeaderTeleport>

  <div
    v-if="isPageLoading"
    class="flex h-96 items-center justify-center page-card-enter"
  >
    <div
      class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground"
    />
  </div>

  <div v-else class="p-0 pb-10 page-card-enter">
    <section class="overflow-x-auto overscroll-x-contain">
      <StudioTableHeader
        :table="toStudioTableHeaderTable(table)"
        :get-head-cell-class="getHeadCellClass"
      />
      <Table class="w-full border-collapse table-fixed bg-transparent">
        <StudioTableColGroup :table="toStudioTableHeaderTable(table)" />
        <TableBody>
          <TableEmpty
            v-if="tableRows.length === 0"
            :colspan="visibleColumnCount"
          >
            {{ emptyStateLabel }}
          </TableEmpty>

          <template v-else>
            <TableRow
              v-for="row in tableRows"
              :id="getRowElementId(row.original)"
              :key="row.id"
              class="group border-b border-border border-dashed align-top transition-all duration-50 hover:bg-card/18 hover:[box-shadow:inset_2px_0_0_0_var(--primary),inset_-2px_0_0_0_var(--primary)]"
              @dblclick="handleRowDblClick(row.original)"
            >
              <TableCell
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                :data-column-id="cell.column.id"
                :style="getStudioTableColWidthStyle(cell.column)"
                :class="getBodyCellClass(cell.column.id)"
              >
                <FlexRender
                  :render="cell.column.columnDef.cell"
                  :props="cell.getContext()"
                />
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </section>

    <ClassManagerNameDialog
      :open="isNameDialogOpen"
      :mode="nameDialogState?.mode ?? 'create'"
      :breakpoints="availableBreakpoints"
      :initial-name="dialogTitleRow?.name"
      :initial-css="nameDialogInitialCss"
      @update:open="handleNameDialogOpenChange"
      @submit="handleNameDialogSubmit"
    />

    <ClassCssEditorDialog
      :open="isCssDialogOpen"
      :class-name="cssDialogRow?.name ?? ''"
      :selector-preview="cssDialogSelectorPreview"
      :breakpoints="availableBreakpoints"
      :initial-css="cssDialogInitialValue"
      :initial-breakpoint="cssDialogSelectedBreakpoint"
      :is-saving="isClassEditorLoading"
      @update:open="handleCssDialogOpenChange"
      @submit="handleCssDialogSubmit"
    />

    <Dialog
      :open="isClearConfirmOpen"
      @update:open="isClearConfirmOpen = $event"
    >
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{{ t("design.classes.clearDialog.title") }}</DialogTitle>
          <DialogDescription>
            {{ t("design.classes.clearDialog.description") }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isClearConfirmOpen = false"
            >{{ t("common.cancel") }}</Button
          >
          <Button variant="destructive" @click="confirmClearAllClasses"
            >{{ t("design.classes.clearDialog.confirm") }}</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <DeleteConfirmDialog
      :open="isBulkDeleteOpen"
      :title="
        rowsToDelete.length > 1
          ? t('design.classes.deleteDialog.titleMany')
          : t('design.classes.deleteDialog.titleOne')
      "
      :description="
        rowsToDelete.length > 1
          ? t('design.classes.deleteDialog.descriptionMany', {
              count: rowsToDelete.length,
            })
          : t('design.classes.deleteDialog.descriptionOne')
      "
      :item-name="rowsToDelete.length === 1 ? rowsToDelete[0]?.name : undefined"
      @update:open="isBulkDeleteOpen = $event"
      @confirm="executeDeleteClasses"
    />

    <DesignAssetImportDialog
      :open="isImportDialogOpen"
      :title="t('design.import.classesTitle')"
      :description="t('design.import.classesDescription')"
      :allowed-sections="['classes', 'contextRules', 'animations']"
      :collision-context="importCollisionContext"
      @update:open="isImportDialogOpen = $event"
      @imported="loadExportContextRules"
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
