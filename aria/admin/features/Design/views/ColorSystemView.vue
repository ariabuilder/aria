<script setup lang="ts">
import { computed, ref } from "vue";

import { Button } from "@/components/ui/button";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import ColorSystemInspector from "../components/ColorSystemInspector.vue";
import DesignHeaderTeleport from "../components/DesignHeaderTeleport.vue";
import PaletteTemplateSelector from "../components/PaletteTemplateSelector.vue";
import PaletteScaleRow from "../components/PaletteScaleRow.vue";
import {
  useColorSystemViewState,
  SEMANTIC_TOKENS,
} from "../composables";
import AddPaletteDialog from "../dialogs/AddPaletteDialog.vue";
import ApplyPaletteTemplateDialog from "../dialogs/ApplyPaletteTemplateDialog.vue";
import DeletePaletteDialog from "../dialogs/DeletePaletteDialog.vue";

const {
  palettes,
  semanticColors,
  isLoading,
  isApplyingTemplate,
  isSaving,
  removePalette,
  updatePaletteBaseColor,
  updateSemanticColor,
  getTextColorForBackground,
  showAddModal,
  newPaletteName,
  newPaletteColor,
  newPaletteVarName,
  renamingId,
  renameValue,
  renamingVarId,
  renameVarValue,
  copiedSwatch,
  previewPrimaryBg,
  previewPrimaryText,
  previewOutlineBorder,
  previewOutlineText,
  previewLinkColor,
  accessibilityPairs,
  getSemanticShadeHex,
  getSemanticContrastBadge,
  getSemanticTokenLabel,
  SEMANTIC_SCALE_STOPS,
  copySwatchHex,
  startRename,
  commitRename,
  cancelRename,
  startVarRename,
  commitVarRename,
  cancelVarRename,
  openAddModal,
  closeAddModal,
  handleAddPalette,
  templates,
  getTemplatePreviewRows,
  applySelectedTemplate,
} = useColorSystemViewState();

const { t } = useStudioI18n();
const palettePendingDelete = ref<{ name: string; label: string } | null>(null);
const templatePendingApply = ref<{ id: string; name: string } | null>(null);
const copyAnnouncement = ref("");

function openDeletePaletteDialog(palette: {
  name: string;
  label: string;
}): void {
  palettePendingDelete.value = {
    name: palette.name,
    label: palette.label,
  };
}

function closeDeletePaletteDialog(): void {
  palettePendingDelete.value = null;
}

function confirmDeletePalette(): void {
  if (!palettePendingDelete.value) return;
  removePalette(palettePendingDelete.value.name);
  closeDeletePaletteDialog();
}

function openApplyTemplateDialog(template: { id: string; name: string }): void {
  templatePendingApply.value = {
    id: template.id,
    name: template.name,
  };
}

const pendingTemplatePreviewRows = computed(() => {
  if (!templatePendingApply.value) return [];
  const template = templates.find(
    (entry) => entry.id === templatePendingApply.value?.id,
  );
  return template ? getTemplatePreviewRows(template) : [];
});

function closeApplyTemplateDialog(): void {
  if (!isApplyingTemplate.value) {
    templatePendingApply.value = null;
  }
}

async function confirmApplyTemplate(): Promise<void> {
  if (!templatePendingApply.value) return;
  const templateId = templatePendingApply.value.id;
  await applySelectedTemplate(templateId);
  templatePendingApply.value = null;
}

async function handleCopy(
  hex: string,
  id: string,
  announcement: string,
): Promise<void> {
  const copied = await copySwatchHex(hex, id);
  copyAnnouncement.value = copied
    ? announcement
    : t("design.colors.copyFailed");
}
</script>

<template>
  <DesignHeaderTeleport target="actions">
    <PaletteTemplateSelector
      :templates="templates"
      :is-applying="isApplyingTemplate"
      :get-preview-rows="getTemplatePreviewRows"
      @apply="openApplyTemplateDialog"
    />
  </DesignHeaderTeleport>

  <div class="min-w-0 bg-background px-7 pb-10 page-card-enter">
    <div class="mx-auto max-w-[100rem]">
      <div class="color-workspace-grid">
        <div class="color-editor-column min-w-0 space-y-7">
          <section class="min-w-0 space-y-4" aria-labelledby="color-palettes-heading">
            <div class="flex items-center justify-between gap-3">
              <h2
                id="color-palettes-heading"
                class="m-0 font-serif text-lg font-medium text-foreground"
              >
                {{ t("design.colors.palettes") }}
              </h2>
              <Button
                type="button"
                variant="outline"
                size="xs"
                @click="openAddModal"
              >
                <span :class="[studioIcons.plus, 'size-3.5']" />
                {{ t("design.colors.paletteButton") }}
              </Button>
            </div>

            <div
              class="space-y-3"
            >
              <template v-if="isLoading">
                <article
                  v-for="index in 4"
                  :key="index"
                  class="animate-pulse overflow-hidden rounded-lg border border-solid border-border bg-card/15 p-3.5"
                >
                  <div class="mb-3 flex items-center gap-3">
                    <div class="h-8 w-12 shrink-0 rounded-sm bg-muted" />
                    <div class="flex min-w-0 flex-1 items-center gap-3">
                      <div class="h-4 w-22 rounded bg-muted" />
                      <div class="h-2.5 w-20 rounded bg-muted/60" />
                    </div>
                    <div class="h-2.5 w-16 rounded bg-muted/45" />
                    <div class="size-7 rounded-sm bg-muted/35" />
                  </div>
                  <div class="min-w-0 overflow-hidden">
                    <div class="grid w-full min-w-0 grid-cols-12 gap-1">
                      <div v-for="shade in 12" :key="shade" class="space-y-1.5">
                        <div class="h-9 rounded-sm bg-muted/70" />
                        <div class="h-6 rounded-sm bg-muted/35" />
                      </div>
                    </div>
                  </div>
                </article>
              </template>

              <template v-else>
                <PaletteScaleRow
                  v-for="palette in palettes"
                  :key="palette.name"
                  :palette="palette"
                  :copied-swatch="copiedSwatch"
                  :renaming-label="renamingId === palette.name"
                  :rename-value="renameValue"
                  :renaming-variable="renamingVarId === palette.name"
                  :rename-variable-value="renameVarValue"
                  :get-text-color-for-background="getTextColorForBackground"
                  @update-base-color="updatePaletteBaseColor(palette.name, $event)"
                  @start-rename-label="startRename(palette.name)"
                  @update-rename-value="renameValue = $event"
                  @commit-rename-label="commitRename(palette.name)"
                  @cancel-rename-label="cancelRename"
                  @start-rename-variable="startVarRename(palette.name)"
                  @update-rename-variable-value="renameVarValue = $event"
                  @commit-rename-variable="commitVarRename(palette.name)"
                  @cancel-rename-variable="cancelVarRename"
                  @delete="openDeletePaletteDialog(palette)"
                  @copy="handleCopy"
                />
              </template>
            </div>
          </section>
        </div>

        <aside class="color-inspector-column">
          <div v-if="isLoading" class="h-140 animate-pulse rounded-md bg-muted/35" />
          <ColorSystemInspector
            v-else
            :semantic-colors="semanticColors"
            :semantic-tokens="SEMANTIC_TOKENS"
            :semantic-scale-stops="SEMANTIC_SCALE_STOPS"
            :accessibility-pairs="accessibilityPairs"
            :preview-primary-bg="previewPrimaryBg"
            :preview-primary-text="previewPrimaryText"
            :preview-outline-border="previewOutlineBorder"
            :preview-outline-text="previewOutlineText"
            :preview-link-color="previewLinkColor"
            :get-semantic-shade-hex="getSemanticShadeHex"
            :get-semantic-contrast-badge="getSemanticContrastBadge"
            :get-semantic-token-label="getSemanticTokenLabel"
            @update-semantic-color="updateSemanticColor"
            @copy="handleCopy"
          />
        </aside>
      </div>
    </div>

    <p class="sr-only" aria-live="polite" aria-atomic="true">
      {{ copyAnnouncement }}
    </p>

    <AddPaletteDialog
      :open="showAddModal"
      :name="newPaletteName"
      :variable-name="newPaletteVarName"
      :color="newPaletteColor"
      :is-saving="isSaving"
      @update:open="(open) => !open && closeAddModal()"
      @update:name="newPaletteName = $event"
      @update:variable-name="newPaletteVarName = $event"
      @update:color="newPaletteColor = $event"
      @submit="handleAddPalette"
    />

    <DeletePaletteDialog
      :open="Boolean(palettePendingDelete)"
      :palette-label="palettePendingDelete?.label"
      :palette-name="palettePendingDelete?.name"
      @update:open="(open) => !open && closeDeletePaletteDialog()"
      @confirm="confirmDeletePalette"
    />

    <ApplyPaletteTemplateDialog
      :open="Boolean(templatePendingApply)"
      :template-name="templatePendingApply?.name"
      :preview-rows="pendingTemplatePreviewRows"
      :is-applying="isApplyingTemplate"
      @update:open="(open) => !open && closeApplyTemplateDialog()"
      @confirm="confirmApplyTemplate"
    />
  </div>
</template>

<style scoped>
.color-workspace-grid {
  display: grid;
  min-width: 0;
  gap: 2rem;
}

@media (min-width: 1180px) {
  .color-workspace-grid {
    grid-template-columns: minmax(0, 1fr) 20rem;
    align-items: start;
  }

  .color-inspector-column {
    position: sticky;
    top: 1rem;
    align-self: start;
  }
}

</style>
