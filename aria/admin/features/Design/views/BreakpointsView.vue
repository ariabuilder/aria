<script setup lang="ts">
/**
 * BreakpointsView - Unified Breakpoint Management Manages canvas viewport breakpoints
 * for the visual builder. Two sections: System Defaults.
 */
import { FlexRender } from "@tanstack/vue-table";
import { ref } from "vue";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import {
  Table,
  TableBody,
  TableHeader,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { useBreakpointsViewState } from "../composables";
import { useCustomBreakpointsTable } from "../composables/useCustomBreakpointsTable";
import BreakpointSpectrum from "../components/BreakpointSpectrum.vue";
import CreateBreakpointDialog from "../dialogs/CreateBreakpointDialog.vue";

const { t } = useStudioI18n();

const {
  localBreakpoints,
  newBreakpoint,
  showNewForm,
  isSaving,
  isLoading,
  systemDefaults,
  openNewForm,
  closeNewForm,
  addNewBreakpoint,
  saveBreakpointEdit,
  deleteBreakpointHandler,
  setBreakpointEnabled,
  canToggleBreakpoint,
} = useBreakpointsViewState();

const defaultEditingId = ref<string | null>(null);
const defaultWidth = ref("");

function startDefaultEdit(id: string): void {
  const breakpoint = localBreakpoints.value.find((bp) => bp.id === id);
  if (!breakpoint) return;

  defaultEditingId.value = id;
  defaultWidth.value = String(breakpoint.canvasWidth ?? breakpoint.minWidth);
}

function cancelDefaultEdit(): void {
  defaultEditingId.value = null;
  defaultWidth.value = "";
}

async function saveDefaultEdit(id: string): Promise<void> {
  const breakpoint = localBreakpoints.value.find((bp) => bp.id === id);
  if (!breakpoint) return;

  await saveBreakpointEdit(id, {
    label: breakpoint.label,
    width: defaultWidth.value,
  });
  cancelDefaultEdit();
}

const {
  headerGroups,
  tableRows,
  visibleColumnCount,
  getHeadCellClass,
  getBodyCellClass,
} = useCustomBreakpointsTable({
  allBreakpoints: localBreakpoints,
  onSaveEdit: saveBreakpointEdit,
  onDelete: deleteBreakpointHandler,
  isSaving,
});

function handleCreateDialogOpen(open: boolean): void {
  if (!open) {
    closeNewForm();
  }
}

async function handleAddBreakpoint(): Promise<void> {
  try {
    await addNewBreakpoint();
  } catch {
    // Persistence errors are already surfaced by the breakpoint state.
  }
}
</script>

<template>
  <div class="space-y-8 px-6 py-0 page-card-enter">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="text-sm text-muted-foreground">
        {{ t("design.breakpoints.loading") }}
      </div>
    </div>

    <!-- Content -->
    <div v-else class="space-y-10">
      <section class="space-y-3">
        <h2 class="text-xl m-0 font-medium text-foreground select-none">
          {{ t("design.breakpoints.systemDefaults") }}
        </h2>

        <div class="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="bp in systemDefaults"
            :key="bp.id"
            class="flex flex-col gap-4 rounded-md border border-border bg-background p-5 border-dashed transition-all duration-150 hover:shadow-sm hover:-translate-y-0.5"
          >
            <!-- Header: icon + toggle -->
            <div class="flex items-start justify-between">
              <div
                class="flex size-10 items-center justify-center rounded-md bg-muted"
              >
                <span :class="[bp.iconClass, 'size-5 text-foreground']" />
              </div>
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="isSaving"
                  :title="t('design.breakpoints.table.edit')"
                  :aria-label="t('design.breakpoints.table.edit')"
                  @click="startDefaultEdit(bp.id)"
                >
                  <span :class="[studioIcons.edit, 'size-4']" />
                </Button>
                <Switch
                  :model-value="bp.enabled"
                  :disabled="!canToggleBreakpoint(bp.id)"
                  @update:model-value="
                    (next) => setBreakpointEnabled(bp.id, next)
                  "
                />
              </div>
            </div>

            <!-- Device name -->
            <div class="text-sm font-semibold text-foreground">
              {{ bp.label }}
            </div>

            <!-- Breakpoint value -->
            <div v-if="defaultEditingId === bp.id" class="space-y-2">
              <label
                :for="`breakpoint-width-${bp.id}`"
                class="text-xs font-medium text-muted-foreground"
              >
                {{ t("design.breakpoints.widthPx") }}
              </label>
              <div class="flex items-center gap-2">
                <Input
                  :id="`breakpoint-width-${bp.id}`"
                  v-model="defaultWidth"
                  type="number"
                  min="0"
                  class="h-8"
                  :disabled="isSaving"
                  @keydown.enter="saveDefaultEdit(bp.id)"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="isSaving"
                  :title="t('design.breakpoints.table.save')"
                  :aria-label="t('design.breakpoints.table.save')"
                  class="text-emerald-500 hover:text-emerald-600"
                  @click="saveDefaultEdit(bp.id)"
                >
                  <span class="i-hugeicons:checkmark-circle-01 size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="isSaving"
                  :title="t('design.breakpoints.table.cancel')"
                  :aria-label="t('design.breakpoints.table.cancel')"
                  @click="cancelDefaultEdit"
                >
                  <span class="i-hugeicons:cancel-01 size-4" />
                </Button>
              </div>
            </div>

            <div v-else class="flex flex-col gap-2">
              <span class="text-2xl font-bold text-foreground tabular-nums">
                {{ bp.value
                }}<span class="text-sm text-muted-foreground"> px</span>
              </span>

              <div class="text-xs text-muted-foreground">
                {{ t("design.breakpoints.maxWidth", { range: bp.range }) }}
              </div>
            </div>

            <!-- Description -->
            <p
              class="text-sm leading-relaxed text-muted-foreground line-clamp-2"
            >
              {{ bp.description }}
            </p>
          </div>
        </div>
      </section>

      <section class="grid gap-6 sm:grid-cols-1 lg:grid-cols-1 lg:grid-cols-2">
        <!-- Left: Custom Breakpoints table -->
        <div class="space-y-4 min-w-0">
          <div class="flex items-center justify-between">
            <h2
              class="text-xl m-0 font-medium text-foreground select-none"
            >
              {{ t("design.breakpoints.customBreakpoints") }}
            </h2>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 cursor-pointer focus:outline-none focus:ring-0 focus:ring-offset-0"
              @click="openNewForm"
            >
              <span :class="[studioIcons.plus, 'size-3.5']" />
              {{ t("design.breakpoints.addBreakpoint") }}
            </button>
          </div>

          <Table
            class="breakpoints-table w-full border-collapse bg-background"
          >
            <TableHeader>
              <TableRow
                v-for="headerGroup in headerGroups"
                :key="headerGroup.id"
                class="bg-background! hover:bg-background! border-b border-border border-dashed"
              >
                <TableHead
                  v-for="header in headerGroup.headers"
                  :key="header.id"
                  :class="getHeadCellClass(header.column.id)"
                >
                  <FlexRender
                    v-if="!header.isPlaceholder"
                    :render="header.column.columnDef.header"
                    :props="header.getContext()"
                  />
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              <TableEmpty
                v-if="tableRows.length === 0"
                :colspan="visibleColumnCount"
                row-class="bg-background! hover:bg-background!"
              >
                <div
                  class="flex flex-col items-center gap-3 py-4 text-muted-foreground"
                >
                  <span
                    :class="[
                      studioIcons.layouts,
                      'size-8 text-muted-foreground/40',
                    ]"
                  />
                  <span class="text-sm">
                    {{ t("design.breakpoints.noCustomBreakpoints") }}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    class="mt-1 gap-1.5"
                    @click="openNewForm"
                  >
                    <span :class="[studioIcons.plus, 'size-3.5']" />
                    {{ t("design.breakpoints.addABreakpoint") }}
                  </Button>
                </div>
              </TableEmpty>

              <template v-else>
                <TableRow
                  v-for="row in tableRows"
                  :key="row.id"
                  class="group bg-background! hover:bg-background! border-b border-border border-dashed align-top transition-all duration-100"
                >
                  <TableCell
                    v-for="cell in row.getVisibleCells()"
                    :key="cell.id"
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
        </div>

        <!-- Right: Breakpoint Spectrum -->
        <div class="min-w-0">
          <BreakpointSpectrum :breakpoints="localBreakpoints" />
        </div>
      </section>
    </div>

    <CreateBreakpointDialog
      :open="showNewForm"
      :label="newBreakpoint.label"
      :width="newBreakpoint.width"
      :is-saving="isSaving"
      @update:open="handleCreateDialogOpen"
      @update:label="newBreakpoint.label = $event"
      @update:width="newBreakpoint.width = $event"
      @create="handleAddBreakpoint"
    />
  </div>
</template>

<style scoped>
.breakpoints-table :deep([data-slot="table-row"]),
.breakpoints-table :deep([data-slot="table-row"]:hover) {
  background-color: var(--background) !important;
}
</style>
