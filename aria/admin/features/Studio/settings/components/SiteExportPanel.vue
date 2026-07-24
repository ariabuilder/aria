<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DeleteConfirmDialog } from "@/features/Studio/core/components";
import { useDialogState } from "@/features/Studio/core/composables";
import {
  useSiteExport,
  EXPORT_KEEP_TTL_MINUTES,
  type SiteExportRecord,
} from "../composables/useSiteExport";
import {
  SITE_EXPORT_PRESETS,
  resolveExportSelection,
} from "../../../../../lib/export/selection";
import { SITE_EXPORT_SECTIONS } from "../../../../../lib/export/cmsTypes";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import SettingsRow from "./SettingsRow.vue";
import ExportArchiveCard from "./ExportArchiveCard.vue";

const KEEP_TTL = EXPORT_KEEP_TTL_MINUTES;
const { t } = useStudioI18n();

const retentionOptions = [
  { label: "1D", value: 1_440, full: "1 Day" },
  { label: "3D", value: 4_320, full: "3 Days" },
  { label: "7D", value: 10_080, full: "7 Days" },
  { label: "30D", value: 43_200, full: "30 Days" },
  { label: "60D", value: 86_400, full: "60 Days" },
  { label: "Keep", value: KEEP_TTL, full: "Keep forever" },
] as const;

const {
  isLoadingExports,
  isCreatingExport,
  deletingExportId,
  exportError,
  exportTtlMinutes,
  exportSelection,
  exports: siteExports,
  createSiteExport,
  setExportPreset,
  toggleExportSection,
  deleteExport,
  downloadExport,
  formatDateTime,
  formatExportExpiry,
  formatBytes,
} = useSiteExport({
  fileCode: studioIcons.page,
  layout: studioIcons.layouts,
  component: studioIcons.component,
  cmsCollection: studioIcons.collections,
  cmsEntry: studioIcons.databaseLine,
});

const retentionModel = computed({
  get: () => String(exportTtlMinutes.value),
  set: (value) => {
    exportTtlMinutes.value = Number(value);
  },
});

const resolvedExportSections = computed(
  () => resolveExportSelection(exportSelection.value).sections,
);

function presetLabel(id: string): string {
  switch (id) {
    case "full":
      return t("export.preset.fullSite");
    case "dataOnly":
      return t("export.preset.dataOnly");
    case "codeOnly":
      return t("export.preset.codeOnly");
    case "mediaOnly":
      return t("export.preset.mediaOnly");
    default:
      return id;
  }
}

function presetDescription(id: string): string {
  switch (id) {
    case "full":
      return t("export.preset.fullSiteDescription");
    case "dataOnly":
      return t("export.preset.dataOnlyDescription");
    case "codeOnly":
      return t("export.preset.codeOnlyDescription");
    case "mediaOnly":
      return t("export.preset.mediaOnlyDescription");
    default:
      return "";
  }
}

function exportSectionLabel(id: string): string {
  switch (id) {
    case "pages":
      return t("export.section.pages");
    case "layouts":
      return t("export.section.layouts");
    case "components":
      return t("export.section.components");
    case "designSystem":
      return t("export.section.designSystem");
    case "siteSettings":
      return t("export.section.siteSettings");
    case "media":
      return t("export.section.media");
    case "cms":
      return t("export.section.cms");
    case "redirects":
      return t("export.section.redirects");
    case "discovery":
      return t("export.section.discovery");
    case "contentState":
      return t("export.section.contentState");
    case "pageMetadata":
      return t("export.section.pageMetadata");
    default:
      return id;
  }
}

const exportSectionOptions = SITE_EXPORT_SECTIONS.map((section) => ({
  id: section,
  label: exportSectionLabel(section),
}));

const selectedPresetDescription = computed(() => {
  const preset = SITE_EXPORT_PRESETS.find(
    (candidate) => candidate.id === exportSelection.value.preset,
  );
  return preset ? presetDescription(preset.id) : "";
});

const retentionOptionsByValue = new Map(
  retentionOptions.map((option) => [String(option.value), option]),
);

if (!retentionOptionsByValue.has(String(exportTtlMinutes.value))) {
  exportTtlMinutes.value = 10_080;
}

watch(exportError, (error) => {
  if (error) {
    toast.error(error);
  }
});

const deleteDialog = useDialogState();
const exportPendingDelete = ref<SiteExportRecord | null>(null);

const isConfirmingDelete = computed(
  () =>
    exportPendingDelete.value !== null &&
    deletingExportId.value === exportPendingDelete.value.id,
);

function requestDeleteExport(id: string): void {
  const record = siteExports.value.find((entry) => entry.id === id);
  if (!record) {
    return;
  }

  exportPendingDelete.value = record;
  deleteDialog.open();
}

function closeDeleteDialog(): void {
  deleteDialog.close();
  exportPendingDelete.value = null;
}

async function confirmDeleteExport(): Promise<void> {
  if (!exportPendingDelete.value) {
    return;
  }

  const id = exportPendingDelete.value.id;
  await deleteExport(id);

  if (!siteExports.value.some((entry) => entry.id === id)) {
    closeDeleteDialog();
  }
}
</script>

<template>
  <div
    class="space-y-8 px-12 py-7"
    role="region"
    :aria-label="t('export.aria')"
  >
    <SettingsRow
      :label="t('export.title')"
      :description="t('export.description')"
      full-width
      class="text-balance"
    >
      <div class="mt-3 max-w-2xl space-y-5">
        <div class="space-y-2">
          <Label class="text-xs text-muted-foreground">{{
            t("export.preset")
          }}</Label>
          <div class="flex flex-wrap gap-2">
            <Button
              v-for="preset in SITE_EXPORT_PRESETS"
              :key="preset.id"
              type="button"
              size="sm"
              variant="outline"
              class="h-8"
              :class="
                exportSelection.preset === preset.id
                  ? 'border-primary bg-primary/10 text-foreground'
                  : ''
              "
              @click="setExportPreset(preset.id)"
            >
              {{ presetLabel(preset.id) }}
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            {{ selectedPresetDescription }}
          </p>
        </div>

        <div class="space-y-2">
          <Label class="text-xs text-muted-foreground">{{
            t("export.sections")
          }}</Label>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="section in exportSectionOptions"
              :key="section.id"
              class="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
            >
              <Checkbox
                :model-value="resolvedExportSections[section.id]"
                @update:model-value="
                  (checked) => toggleExportSection(section.id, checked === true)
                "
              />
              <span>{{ section.label }}</span>
            </label>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <Button
            variant="default"
            size="sm"
            class="h-9!"
            :disabled="isCreatingExport"
            @click="createSiteExport"
          >
            <span
              :class="[
                studioIcons.download,
                'size-4 mr-2',
                isCreatingExport && 'animate-pulse',
              ]"
            />
            {{
              isCreatingExport ? t("export.generating") : t("export.generate")
            }}
          </Button>
        </div>
      </div>
    </SettingsRow>

    <SettingsRow
      :label="t('export.retention')"
      :description="t('export.retentionDescription')"
      full-width
    >
      <RadioGroup
        v-model="retentionModel"
        class="flex w-full max-w-md flex-wrap gap-1.5"
      >
        <div
          v-for="option in retentionOptions"
          :key="option.value"
          class="relative"
        >
          <RadioGroupItem
            :value="String(option.value)"
            :aria-label="option.full"
            class="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          />
          <div
            class="select-none rounded-sm px-3 py-1.5 text-center text-xs font-medium transition-all duration-150 peer-hover:border-primary/80 peer-hover:bg-card peer-hover:text-primary-foreground"
            :class="
              String(exportTtlMinutes) === String(option.value)
                ? 'bg-primary/70 border-primary/40 border-solid text-primary-foreground shadow-sm'
                : 'bg-card/50 hover:bg-card! border-border/50 border-solid text-muted-foreground'
            "
          >
            {{ option.label }}
          </div>
        </div>
      </RadioGroup>
    </SettingsRow>

    <SettingsRow
      :label="t('export.archives')"
      :description="t('export.archivesDescription')"
      full-width
    >
      <div v-if="isLoadingExports" class="max-w-2xl">
        <div
          class="h-36 animate-pulse rounded-lg border border-border bg-muted/30"
        />
      </div>

      <div
        v-else-if="siteExports.length > 0"
        class="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <ExportArchiveCard
          v-for="record in siteExports"
          :key="record.id"
          :record="record"
          :is-deleting="deletingExportId === record.id"
          :format-date-time="formatDateTime"
          :format-export-expiry="formatExportExpiry"
          :format-bytes="formatBytes"
          @download="downloadExport"
          @delete="requestDeleteExport"
        />
      </div>

      <div v-else class="w-full">
        <div class="bg-background px-6 py-8 text-center">
          <span
            :class="[
              studioIcons.archived,
              'mx-auto mb-4 block size-8 text-muted-foreground/40',
            ]"
          />
          <p class="text-sm font-medium text-muted-foreground leading-2">
            {{ t("export.empty") }}
          </p>
          <p class="mx-auto mt-1 text-balance text-xs text-muted-foreground/70">
            {{ t("export.emptyDescription") }}
          </p>
        </div>
      </div>
    </SettingsRow>

    <DeleteConfirmDialog
      :open="deleteDialog.isOpen.value"
      :title="t('export.deleteTitle')"
      :description="t('export.deleteDescription')"
      :item-name="
        exportPendingDelete
          ? formatDateTime(exportPendingDelete.createdAt)
          : undefined
      "
      :is-loading="isConfirmingDelete"
      @update:open="
        (open) => (open ? deleteDialog.open() : closeDeleteDialog())
      "
      @confirm="confirmDeleteExport"
    />
  </div>
</template>
