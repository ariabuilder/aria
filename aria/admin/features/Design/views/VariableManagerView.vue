<script setup lang="ts">
import { FlexRender } from "@tanstack/vue-table";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DesignAssetImportDialog from "../dialogs/DesignAssetImportDialog.vue";
import { useDesignSystem } from "../composables/useDesignSystem";
import { useVariableManagerBootstrap } from "../composables/useVariableManagerBootstrap";
import { useGlobalStyles } from "../composables/useGlobalStyles";
import { useVariableManagerTable } from "../composables/useVariableManagerTable";
import type { VariableManagerRow } from "../lib/variableManagerTable";
import { buildVariableManagerTokenOptions } from "../lib/variableManagerTokens";
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
} from "@/features/Studio/core/components";
import FilterIconMenu from "@/features/Studio/core/components/FilterIconMenu.vue";
import HeaderActionDropdownTooltip from "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import DesignHeaderTeleport from "../components/DesignHeaderTeleport.vue";
import type { VariableManagerSegment } from "../lib/variableManagerTable";
import { toStudioTableHeaderTable } from "@/features/Studio/core/lib/studioTableHeader";

const isImportDialogOpen = ref(false);
const isClearConfirmOpen = ref(false);
const isBulkDeleteOpen = ref(false);
const rowsToDelete = ref<VariableManagerRow[]>([]);
const { t } = useStudioI18n();

const {
  globalStyles,
  hasLoaded,
  isLoading: isGlobalStylesLoading,
  addCustomVariableWithHistory,
  duplicateCustomVariableWithHistory,
  removeCustomVariableWithHistory,
  removeCustomVariablesWithHistory,
  replaceVariablesWithHistory,
  renameCustomVariableKeyWithHistory,
  addAliasWithHistory,
  duplicateAliasWithHistory,
  removeAliasWithHistory,
  removeAliasesWithHistory,
  renameAliasKeyWithHistory,
} = useGlobalStyles();

const { palettes, semanticColors } = useDesignSystem();
const {
  isVariablesLoading,
  isTokenInventoryLoading,
  loadVariableManagerBootstrap,
} = useVariableManagerBootstrap();

const isPageLoading = computed(
  () =>
    !hasLoaded.value ||
    isGlobalStylesLoading.value ||
    isVariablesLoading.value,
);

const customVariableOptions = computed(() =>
  Object.entries(globalStyles.value.variables.custom).map(
    ([key, variable]) => ({
      value: key,
      label: variable.label.trim() || `--${key}`,
    }),
  ),
);
const designTokenOptions = computed(() =>
  buildVariableManagerTokenOptions(palettes.value, semanticColors.value),
);
const {
  searchQuery,
  activeSegment,
  filters,
  table,
  rows,
  rowSelection,
  hasActiveFilters,
  setActiveSegment,
} = useVariableManagerTable({
  globalStyles,
  designTokenOptions,
  customVariableOptions,
  tokenOptionsLoading: isTokenInventoryLoading,
  renameCustomVariableKey: renameCustomVariableKeyWithHistory,
  renameAliasKey: renameAliasKeyWithHistory,
  duplicateCustomVariable: (key) => {
    const row = rows.value.find(
      (entry) => entry.kind === "custom" && entry.key === key,
    );
    if (row) {
      void confirmDuplicateVariables(row.id);
    }
    return Promise.resolve(null);
  },
  duplicateAlias: (key) => {
    const row = rows.value.find(
      (entry) => entry.kind === "alias" && entry.key === key,
    );
    if (row) {
      void confirmDuplicateVariables(row.id);
    }
    return Promise.resolve(null);
  },
  removeCustomVariable: (key) => {
    const row = rows.value.find(
      (entry) => entry.kind === "custom" && entry.key === key,
    );
    if (row) {
      confirmDeleteVariables(row.id);
    }
  },
  removeAlias: (key) => {
    const row = rows.value.find(
      (entry) => entry.kind === "alias" && entry.key === key,
    );
    if (row) {
      confirmDeleteVariables(row.id);
    }
  },
});
const selectedIds = useSelectedIds(table, (row) => row.id, rowSelection);
const tableRows = computed(() => table.getRowModel().rows);
const visibleColumnCount = computed(() => table.getVisibleLeafColumns().length);

// Rendering all rows at once (hundreds of interactive cells: selects, inputs,
// token pickers) froze the page on mount. Render in incremental windows and
// grow the window as the user scrolls, like an infinite-scroll feed.
const ROW_PAGE_SIZE = 30;
const visibleRowCount = ref(ROW_PAGE_SIZE);
const visibleTableRows = computed(() =>
  tableRows.value.slice(0, visibleRowCount.value),
);
const hasMoreRows = computed(
  () => visibleRowCount.value < tableRows.value.length,
);
const loadMoreSentinel = ref<HTMLElement | null>(null);
let loadMoreObserver: IntersectionObserver | null = null;

function growVisibleRowCount(): void {
  if (visibleRowCount.value >= tableRows.value.length) {
    return;
  }
  visibleRowCount.value = Math.min(
    visibleRowCount.value + ROW_PAGE_SIZE,
    tableRows.value.length,
  );
}

function revealRowByKey(kind: "custom" | "alias", key: string): void {
  const index = tableRows.value.findIndex(
    (row) => row.original.kind === kind && row.original.key === key,
  );
  if (index === -1) {
    return;
  }

  const needed = index + 1;
  if (needed > visibleRowCount.value) {
    visibleRowCount.value = needed;
  }
}

watch([searchQuery, activeSegment], () => {
  visibleRowCount.value = Math.min(ROW_PAGE_SIZE, tableRows.value.length);
});

watch(loadMoreSentinel, (element, previousElement) => {
  if (previousElement && loadMoreObserver) {
    loadMoreObserver.unobserve(previousElement);
  }
  if (element && loadMoreObserver) {
    loadMoreObserver.observe(element);
  }
});

onMounted(() => {
  if (typeof IntersectionObserver === "undefined") {
    return;
  }

  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        growVisibleRowCount();
      }
    },
    { rootMargin: "600px 0px" },
  );

  if (loadMoreSentinel.value) {
    loadMoreObserver.observe(loadMoreSentinel.value);
  }
});

onBeforeUnmount(() => {
  loadMoreObserver?.disconnect();
  loadMoreObserver = null;
});

const emptyStateLabel = computed(() => {
  if (rows.value.length === 0) {
    return t("design.variables.empty.noVariables");
  }

  if (hasActiveFilters.value) {
    return t("design.variables.empty.noMatches");
  }

  return t("design.variables.empty.noAvailable");
});
function getRowElementId(row: VariableManagerRow): string {
  return `variable-row-${row.kind}-${row.key}`;
}

function getHeadCellClass(columnId: string): string | undefined {
  switch (columnId) {
    case "kind":
      return "pl-6 pr-3";
    case "actions":
      return "sticky right-0 text-right";
    default:
      return undefined;
  }
}

function getBodyCellClass(columnId: string): string {
  switch (columnId) {
    case "select":
      return "px-3 py-2 align-middle";
    case "kind":
      return "pl-6 pr-3 py-2 align-middle whitespace-normal";
    case "actions":
      return "sticky right-0 bg-background py-2 pr-3 align-middle whitespace-normal text-right transition-colors group-hover:bg-card/18";
    default:
      return "px-3 py-2 align-middle whitespace-normal";
  }
}

async function jumpToRow(rowId: string | null): Promise<void> {
  if (!rowId || typeof document === "undefined") {
    return;
  }

  await nextTick();

  const row = document.getElementById(rowId);
  row?.scrollIntoView({ behavior: "smooth", block: "center" });

  const input = row?.querySelector("input, button");
  if (input instanceof HTMLElement) {
    input.focus();
  }
}

async function handleAddCustomVariable(): Promise<void> {
  const key = await addCustomVariableWithHistory();
  if (!key) {
    return;
  }

  revealRowByKey("custom", key);
  void jumpToRow(`variable-row-custom-${key}`);
}

async function handleAddAlias(): Promise<void> {
  const key = await addAliasWithHistory();
  if (!key) {
    return;
  }

  revealRowByKey("alias", key);
  void jumpToRow(`variable-row-alias-${key}`);
}

function resolveSelectedRows(ids: readonly string[]): VariableManagerRow[] {
  return ids
    .map((id) => rows.value.find((row) => row.id === id))
    .filter((row): row is VariableManagerRow => row !== undefined);
}

function confirmDeleteVariables(rowId?: string): void {
  const ids = resolveBulkTargets(rowId, selectedIds.value);
  const targets = resolveSelectedRows(ids);
  if (targets.length === 0) {
    return;
  }

  rowsToDelete.value = targets;
  isBulkDeleteOpen.value = true;
}

async function executeDeleteVariables(): Promise<void> {
  const targets = [...rowsToDelete.value];
  if (targets.length === 0) {
    return;
  }

  const customKeys = targets
    .filter((row) => row.kind === "custom")
    .map((row) => row.key);
  const aliasKeys = targets
    .filter((row) => row.kind === "alias")
    .map((row) => row.key);

  let succeeded = 0;
  let failed = 0;

  // Batch delete custom variables — one history entry, one backend save
  if (customKeys.length > 0) {
    const ok = await removeCustomVariablesWithHistory(customKeys);
    if (ok) {
      succeeded += customKeys.length;
    } else {
      failed += customKeys.length;
    }
  }

  // Batch delete aliases — one history entry, one backend save
  if (aliasKeys.length > 0) {
    const ok = await removeAliasesWithHistory(aliasKeys);
    if (ok) {
      succeeded += aliasKeys.length;
    } else {
      failed += aliasKeys.length;
    }
  }

  clearRowSelection(rowSelection);
  rowsToDelete.value = [];
  isBulkDeleteOpen.value = false;

  if (failed > 0) {
    toast.error(
      t("design.variables.toast.deleteFailed", {
        failed,
        total: targets.length,
      }),
    );
    return;
  }

  toast.success(
    succeeded === 1
      ? t("design.variables.toast.deletedOne", { count: succeeded })
      : t("design.variables.toast.deletedMany", { count: succeeded }),
  );
}

async function confirmDuplicateVariables(rowId?: string): Promise<void> {
  const ids = resolveBulkTargets(rowId, selectedIds.value);
  const targets = resolveSelectedRows(ids);
  if (targets.length === 0) {
    return;
  }

  let succeeded = 0;
  let lastJump: { id: string; kind: "custom" | "alias"; key: string } | null =
    null;

  for (const row of targets) {
    const nextKey =
      row.kind === "custom"
        ? await duplicateCustomVariableWithHistory(row.key)
        : await duplicateAliasWithHistory(row.key);
    if (nextKey) {
      succeeded += 1;
      lastJump = {
        id: `variable-row-${row.kind}-${nextKey}`,
        kind: row.kind,
        key: nextKey,
      };
    }
  }

  clearRowSelection(rowSelection);

  if (succeeded > 0) {
    toast.success(
      succeeded === 1
        ? t("design.variables.toast.duplicatedOne", { count: succeeded })
        : t("design.variables.toast.duplicatedMany", { count: succeeded }),
    );
    if (lastJump) {
      revealRowByKey(lastJump.kind, lastJump.key);
      void jumpToRow(lastJump.id);
    }
  }
}

function handleClearVariables(): void {
  isClearConfirmOpen.value = true;
}

async function confirmClearVariables(): Promise<void> {
  isClearConfirmOpen.value = false;
  const customCount = Object.keys(globalStyles.value.variables.custom).length;
  const aliasCount = Object.keys(globalStyles.value.variables.aliases).length;

  if (customCount === 0 && aliasCount === 0) {
    toast.success(t("design.variables.toast.noneToClear"));
    return;
  }

  await replaceVariablesWithHistory({ custom: {}, aliases: {} });

  toast.success(
    t("design.variables.toast.cleared", { customCount, aliasCount }),
  );
}

void loadVariableManagerBootstrap(undefined, { silent: true });
</script>

<template>
  <DesignHeaderTeleport target="toolbar">
    <FilterIconMenu
      :model-value="activeSegment"
      :filters="filters"
      @update:model-value="setActiveSegment($event as VariableManagerSegment)"
    />
  </DesignHeaderTeleport>

  <DesignHeaderTeleport target="search">
    <SearchOrBulkToolbar
      :count="selectedIds.length"
      :entity-label="t('design.variables.entity')"
      :search-query="searchQuery"
      :search-placeholder="t('design.variables.searchPlaceholder')"
      @update:search-query="(value) => (searchQuery = value)"
      @duplicate="confirmDuplicateVariables()"
      @delete="confirmDeleteVariables()"
    />
  </DesignHeaderTeleport>

  <DesignHeaderTeleport target="importExport">
    <HeaderActionDropdownTooltip :label="t('design.variables.moreActions')">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="headerAction"
            size="icon-header"
            :aria-label="t('design.variables.moreActions')"
          >
            <span :class="[studioIcons.moreHorizontal, 'size-3.5 shrink-0']" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem @select="isImportDialogOpen = true">
              {{ t("design.variables.menu.import") }}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" @select="handleClearVariables">
              {{ t("design.variables.menu.clearAll") }}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </HeaderActionDropdownTooltip>
  </DesignHeaderTeleport>

  <DesignHeaderTeleport target="actions">
    <Button size="md" variant="outline" @click="handleAddCustomVariable">
      <span class="i-hugeicons:add-01 mr-1.5 size-3.5" />
      {{ t("design.variables.addVariable") }}
    </Button>
    <Button size="md" variant="default" @click="handleAddAlias">
      <span class="i-hugeicons:add-01 mr-1.5 size-3.5" />
      {{ t("design.variables.addAlias") }}
    </Button>
  </DesignHeaderTeleport>

  <div
    v-if="isPageLoading"
    class="flex h-96 items-center justify-center page-card-enter"
  >
    <div
      class="i-hugeicons:loading-01 h-6 w-6 animate-spin text-muted-foreground"
    />
  </div>

  <div v-else class="p-0 pb-10 page-card-enter">
    <section>
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
              v-for="row in visibleTableRows"
              :id="getRowElementId(row.original)"
              :key="row.id"
              class="group border-b border-border border-dashed align-top transition-all duration-50 hover:bg-card/18 hover:[box-shadow:inset_2px_0_0_0_var(--primary),inset_-2px_0_0_0_var(--primary)]"
            >
              <TableCell
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                :style="{ width: `${cell.column.getSize()}px` }"
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

      <div
        v-if="hasMoreRows"
        ref="loadMoreSentinel"
        class="flex items-center justify-center py-4 text-2xs text-muted-foreground/60"
      >
        <span
          class="i-hugeicons:loading-01 mr-2 size-3.5 animate-spin"
        />
        {{ t("design.variables.loadingMore") }}
      </div>
    </section>

    <DeleteConfirmDialog
      :open="isBulkDeleteOpen"
      :title="
        rowsToDelete.length > 1
          ? t('design.variables.deleteDialog.titleMany')
          : t('design.variables.deleteDialog.titleOne')
      "
      :description="
        rowsToDelete.length > 1
          ? t('design.variables.deleteDialog.descriptionMany', { count: rowsToDelete.length })
          : t('design.variables.deleteDialog.descriptionOne')
      "
      :item-name="rowsToDelete.length === 1 ? rowsToDelete[0]?.key : undefined"
      @update:open="isBulkDeleteOpen = $event"
      @confirm="executeDeleteVariables"
    />

    <DesignAssetImportDialog
      :open="isImportDialogOpen"
      @update:open="isImportDialogOpen = $event"
    />

    <Dialog
      :open="isClearConfirmOpen"
      @update:open="isClearConfirmOpen = $event"
    >
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{{ t("design.variables.clearDialog.title") }}</DialogTitle>
          <DialogDescription>
            {{ t("design.variables.clearDialog.description") }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isClearConfirmOpen = false"
            >{{ t("common.cancel") }}</Button
          >
          <Button variant="destructive" @click="confirmClearVariables"
            >{{ t("design.variables.clearDialog.confirm") }}</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
