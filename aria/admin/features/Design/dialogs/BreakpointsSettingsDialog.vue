<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStudioI18n } from "@/i18n";
import { useBreakpointsViewState } from "../composables";

interface Props {
  open: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const { t } = useStudioI18n();

const {
  localBreakpoints: breakpoints,
  editingId,
  editValues,
  newBreakpoint,
  showNewForm,
  isSaving,
  isLoading,
  sortedBreakpoints,
  startEdit,
  cancelEdit,
  saveBreakpointEdit,
  addNewBreakpoint,
  deleteBreakpointHandler,
  toggleBreakpointHandler,
  closeNewForm,
} = useBreakpointsViewState();

const saveBreakpoint = async (): Promise<void> => {
  if (!editingId.value) {
    return;
  }

  await saveBreakpointEdit(editingId.value, editValues.value);
  cancelEdit();
};

const breakpointLabel = (id: string, fallback: string): string => {
  switch (id) {
    case "base":
      return t("design.breakpoints.default.base");
    case "laptop":
      return t("design.breakpoints.default.laptop");
    case "tablet":
      return t("design.breakpoints.default.tablet");
    case "mobile":
      return t("design.breakpoints.default.mobile");
    default:
      return fallback;
  }
};

const isBreakpointEnabled = (id: string): boolean => {
  return breakpoints.value.some(
    (breakpoint) => breakpoint.id === id && breakpoint.enabled,
  );
};

const toggleBreakpoint = async (id: string): Promise<void> => {
  const breakpoint = breakpoints.value.find((candidate) => candidate.id === id);
  if (!breakpoint) {
    return;
  }

  await toggleBreakpointHandler(breakpoint.id);
};

const deleteBreakpoint = async (id: string): Promise<void> => {
  const breakpoint = breakpoints.value.find((candidate) => candidate.id === id);
  if (!breakpoint) {
    return;
  }

  await deleteBreakpointHandler(breakpoint.id);
};

const handleOpenChange = (open: boolean): void => {
  emit("update:open", open);
};
</script>

<template>
  <Dialog :open="props.open" @update:open="handleOpenChange">
    <DialogContent class="max-w-2xl max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>{{ t("design.breakpoints.settings.title") }}</DialogTitle>
        <DialogDescription>
          {{ t("design.breakpoints.settings.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto px-6 py-4">
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <div class="text-sm text-muted-foreground">
            {{ t("design.breakpoints.loading") }}
          </div>
        </div>

        <div v-else class="space-y-4">
          <!-- New Breakpoint Form -->
          <div
            v-if="showNewForm"
            class="p-3 rounded-lg border border-primary/30 bg-primary/5"
          >
            <div class="space-y-2 mb-3">
              <div>
                <label
                  class="text-[10px] uppercase font-semibold text-muted-foreground block mb-1"
                >
                  {{ t("design.breakpoints.label") }}
                </label>
                <input
                  v-model="newBreakpoint.label"
                  type="text"
                  :placeholder="t('design.breakpoints.labelPlaceholderComma')"
                  class="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <label
                  class="text-[10px] uppercase font-semibold text-muted-foreground block mb-1"
                >
                  {{ t("design.breakpoints.widthPx") }}
                </label>
                <input
                  v-model="newBreakpoint.width"
                  type="number"
                  :placeholder="t('design.breakpoints.widthPlaceholderComma')"
                  class="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div class="flex gap-2">
              <button
                @click="addNewBreakpoint"
                :disabled="isSaving"
                class="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground transition-colors"
              >
                {{ t("design.breakpoints.add") }}
              </button>
              <button
                @click="closeNewForm()"
                class="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-muted hover:bg-accent text-foreground transition-colors"
              >
                {{ t("common.cancel") }}
              </button>
            </div>
          </div>

          <!-- Breakpoints List -->
          <div class="space-y-2">
            <div
              v-for="bp in sortedBreakpoints"
              :key="bp.id"
              class="p-3 rounded-lg border border-border bg-card/50 hover:border-border/80 transition-colors"
            >
              <!-- View Mode -->
              <div
                v-if="editingId !== bp.id"
                class="flex items-center justify-between gap-3"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-semibold text-foreground">
                    {{ breakpointLabel(bp.id, bp.label) }}
                  </div>
                  <div class="text-[11px] text-muted-foreground">
                    {{
                      bp.canvasWidth !== null
                        ? `${bp.canvasWidth}px`
                        : t("design.breakpoints.fluid")
                    }}
                  </div>
                </div>
                <div class="flex gap-1 shrink-0 items-center">
                  <!-- Enable/Disable Toggle -->
                  <button
                    @click="toggleBreakpoint(bp.id)"
                    :disabled="bp.id === 'base'"
                    :class="[
                      'p-1.5 rounded transition-colors',
                      isBreakpointEnabled(bp.id)
                        ? 'text-primary hover:bg-primary/10'
                        : 'text-muted-foreground hover:bg-accent',
                      bp.id === 'base' ? 'opacity-50 cursor-not-allowed' : '',
                    ]"
                    :title="
                      bp.id === 'base'
                        ? t('design.breakpoints.desktopAlwaysEnabled')
                        : isBreakpointEnabled(bp.id)
                          ? t('design.breakpoints.disable')
                          : t('design.breakpoints.enable')
                    "
                  >
                    <span
                      aria-hidden="true"
                      class="i-hugeicons:power-service size-3.5 shrink-0"
                    />
                  </button>
                  <button
                    @click="startEdit(bp)"
                    :title="t('design.breakpoints.table.edit')"
                    :aria-label="t('design.breakpoints.table.edit')"
                    class="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <span
                      aria-hidden="true"
                      class="i-hugeicons:pen-01 size-3.5 shrink-0"
                    />
                  </button>
                  <button
                    v-if="!bp.isDefault"
                    @click="deleteBreakpoint(bp.id)"
                    :title="t('design.breakpoints.table.delete')"
                    :aria-label="t('design.breakpoints.table.delete')"
                    class="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                  >
                    <span
                      aria-hidden="true"
                      class="i-hugeicons:delete-02 size-3.5 shrink-0"
                    />
                  </button>
                </div>
              </div>

              <!-- Edit Mode -->
              <div v-else class="space-y-2">
                <div>
                  <label
                    class="text-[10px] uppercase font-semibold text-muted-foreground block mb-1"
                  >
                    {{ t("design.breakpoints.label") }}
                  </label>
                  <input
                    v-model="editValues.label"
                    type="text"
                    class="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground"
                  />
                </div>
                <div>
                  <label
                    class="text-[10px] uppercase font-semibold text-muted-foreground block mb-1"
                  >
                    {{ t("design.breakpoints.widthPx") }}
                  </label>
                  <input
                    v-model="editValues.width"
                    type="number"
                    class="w-full px-2 py-1.5 text-xs bg-background border border-border rounded text-foreground"
                  />
                </div>
                <div class="flex gap-2">
                  <button
                    @click="saveBreakpoint"
                    :disabled="isSaving"
                    class="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground transition-colors flex items-center justify-center gap-1"
                  >
                    <span
                      aria-hidden="true"
                      class="i-hugeicons:checkmark-circle-02 size-3.5 shrink-0"
                    />
                    {{ t("design.breakpoints.table.save") }}
                  </button>
                  <button
                    @click="cancelEdit"
                    class="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-muted hover:bg-accent text-foreground transition-colors flex items-center justify-center gap-1"
                  >
                    <span
                      aria-hidden="true"
                      class="i-hugeicons:cancel-circle size-3.5 shrink-0"
                    />
                    {{ t("common.cancel") }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Add Button -->
          <button
            v-if="!showNewForm"
            @click="showNewForm = true"
            class="w-full px-3 py-2 rounded-lg border border-border hover:border-border/80 text-foreground hover:text-foreground text-xs font-medium transition-colors flex items-center justify-center gap-2"
          >
            <span
              aria-hidden="true"
              class="i-hugeicons:add-circle size-3.5 shrink-0"
            />
            {{ t("design.breakpoints.addBreakpoint") }}
          </button>

          <!-- Empty State -->
          <div v-if="breakpoints.length === 0" class="text-center py-8">
            <div class="text-sm text-muted-foreground">
              {{ t("design.breakpoints.noConfigured") }}
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
