<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import { ListCollectionsResponseSchema } from "../../../../../lib/cms/actionSchemas";
import type { FieldType } from "../../../../../lib/cms/constants";
import { AriaCollectionSchema } from "../../../../../lib/cms/schemas";
import {
  MarkdownImportApplyReportSchema,
  MarkdownImportPreviewSchema,
} from "../../../../../lib/cms/markdown-import/schemas";

type Collection = z.infer<typeof AriaCollectionSchema>;
type Preview = z.infer<typeof MarkdownImportPreviewSchema>;
type SuggestedField = Preview["fieldSuggestions"][number];
type SelectedSuggestedField = Pick<SuggestedField, "key" | "type">;

const suggestedFieldTypeLabels = {
  string: "Short text",
  text: "Long text",
  slug: "Slug",
  number: "Number",
  integer: "Integer",
  boolean: "Boolean",
  select: "Choice",
  multiSelect: "Multiple choice",
} satisfies Partial<Record<FieldType, string>>;

const fileInput = ref<HTMLInputElement | null>(null);
const { t } = useStudioI18n();
const collections = ref<Collection[]>([]);
const selectedCollectionId = ref("");
const selectedFile = ref<File | null>(null);
const updateExisting = ref(false);
const selectedSuggestedFields = ref<SelectedSuggestedField[]>([]);
const preview = ref<Preview | null>(null);
const isLoadingCollections = ref(false);
const isPreviewing = ref(false);
const isApplying = ref(false);

const selectedFileLabel = computed(() => {
  if (!selectedFile.value) return "No source selected";
  return `${selectedFile.value.name} - ${Math.max(1, Math.round(selectedFile.value.size / 1024))} KB`;
});

function chooseFile(): void {
  fileInput.value?.click();
}

function invalidatePreview(): void {
  preview.value = null;
  selectedSuggestedFields.value = [];
}

function isSuggestedFieldSelected(key: string): boolean {
  return selectedSuggestedFields.value.some((field) => field.key === key);
}

function selectedSuggestedFieldType(field: SuggestedField): FieldType {
  return (
    selectedSuggestedFields.value.find((item) => item.key === field.key)
      ?.type ?? field.type
  );
}

function toggleSuggestedField(field: SuggestedField): void {
  selectedSuggestedFields.value = isSuggestedFieldSelected(field.key)
    ? selectedSuggestedFields.value.filter((item) => item.key !== field.key)
    : [...selectedSuggestedFields.value, { key: field.key, type: field.type }];
}

function updateSuggestedFieldType(field: SuggestedField, value: unknown): void {
  if (typeof value !== "string") return;
  const type = field.allowedTypes.find((candidate) => candidate === value);
  if (!type) return;
  selectedSuggestedFields.value = selectedSuggestedFields.value.map((item) =>
    item.key === field.key ? { ...item, type } : item,
  );
}

function suggestedFieldTypeLabel(type: FieldType): string {
  return suggestedFieldTypeLabels[type] ?? type;
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
  invalidatePreview();
}

function formData(): FormData | null {
  if (!selectedFile.value || !selectedCollectionId.value) return null;
  const data = new FormData();
  data.append("file", selectedFile.value);
  data.append("collectionId", selectedCollectionId.value);
  data.append("mode", updateExisting.value ? "update" : "create");
  data.append("addFields", JSON.stringify(selectedSuggestedFields.value));
  return data;
}

async function loadCollections(): Promise<void> {
  isLoadingCollections.value = true;
  try {
    const { data, error } = await actions.cms.collections.list({});
    if (error) throw new Error(error.message);
    const collectionsResult = ListCollectionsResponseSchema.safeParse(data);
    if (!collectionsResult.success)
      throw new Error("Collection response was invalid");
    collections.value = collectionsResult.data.collections;
    if (!selectedCollectionId.value && collections.value[0]) {
      selectedCollectionId.value = collections.value[0].id;
    }
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Could not load collections",
    );
  } finally {
    isLoadingCollections.value = false;
  }
}

async function createPreview(): Promise<void> {
  const data = formData();
  if (!data) {
    toast.error("Choose a collection and Markdown source first");
    return;
  }
  isPreviewing.value = true;
  try {
    const result = await actions.cms.markdownImport.preview(data);
    if (result.error) throw new Error(result.error.message);
    preview.value = MarkdownImportPreviewSchema.parse(result.data);
    selectedSuggestedFields.value = [];
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Markdown preview failed",
    );
  } finally {
    isPreviewing.value = false;
  }
}

async function applyImport(): Promise<void> {
  const data = formData();
  if (!data || !preview.value?.canApply) return;
  isApplying.value = true;
  try {
    const result = await actions.cms.markdownImport.apply(data);
    if (result.error) throw new Error(result.error.message);
    const report = MarkdownImportApplyReportSchema.parse(result.data);
    preview.value = report;
    selectedSuggestedFields.value = [];
    if (report.applied) {
      toast.success(
        report.addedFieldKeys.length > 0
          ? `Markdown import complete. Added ${report.addedFieldKeys.length} schema field${report.addedFieldKeys.length === 1 ? "" : "s"}.`
          : "Markdown import complete",
      );
    } else {
      toast.error("Import was blocked by the current diagnostics");
    }
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Markdown import failed",
    );
  } finally {
    isApplying.value = false;
  }
}

onMounted(() => void loadCollections());
</script>

<template>
  <section
    class="min-w-0 space-y-6 px-7 py-7"
    :aria-label="t('import.markdown.aria')"
  >
    <div class="space-y-2">
      <h3 class="m-0 font-serif text-xl font-medium text-foreground">
        {{ t("import.markdown.title") }}
      </h3>
      <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {{ t("import.markdown.description") }}
      </p>
    </div>

    <div class="grid max-w-3xl gap-4 sm:grid-cols-2">
      <label class="grid gap-2 text-sm font-medium text-foreground">
        {{ t("import.markdown.collection") }}
        <select
          v-model="selectedCollectionId"
          class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          :disabled="isLoadingCollections"
          @change="invalidatePreview"
        >
          <option v-if="!collections.length" value="">
            {{ t("import.markdown.noCollections") }}
          </option>
          <option
            v-for="collection in collections"
            :key="collection.id"
            :value="collection.id"
          >
            {{ collection.label }} ({{ collection.name }})
          </option>
        </select>
      </label>
      <div class="grid gap-2 text-sm font-medium text-foreground">
        {{ t("import.markdown.source") }}
        <input
          ref="fileInput"
          type="file"
          accept=".md,.mdx,.zip,text/markdown,application/zip"
          class="sr-only"
          @change="handleFileChange"
        />
        <Button
          type="button"
          variant="outline"
          class="justify-start"
          @click="chooseFile"
        >
          <span :class="[studioIcons.upload, 'mr-2 size-4']" />
          {{ selectedFileLabel }}
        </Button>
      </div>
    </div>

    <label
      class="flex max-w-3xl items-start gap-3 border-y border-border/70 py-4 text-sm text-foreground"
    >
      <Checkbox
        v-model="updateExisting"
        class="mt-0.5"
        @update:model-value="invalidatePreview"
      />
      <span>
        <span class="block font-medium">{{
          t("import.markdown.updateExisting")
        }}</span>
        <span
          class="mt-0.5 block text-xs leading-relaxed text-muted-foreground"
        >
          {{ t("import.markdown.updateExistingDescription") }}
        </span>
      </span>
    </label>

    <div class="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="default"
        :disabled="isPreviewing || isApplying"
        @click="createPreview"
      >
        <span :class="[studioIcons.task, 'mr-2 size-4']" />
        {{
          isPreviewing
            ? t("import.markdown.checking")
            : t("import.markdown.preview")
        }}
      </Button>
      <Button
        v-if="preview"
        type="button"
        variant="outline"
        :disabled="!preview.canApply || isPreviewing || isApplying"
        @click="applyImport"
      >
        <span :class="[studioIcons.databaseLine, 'mr-2 size-4']" />
        {{
          isApplying
            ? t("import.markdown.importing")
            : t("import.markdown.apply")
        }}
      </Button>
    </div>

    <div v-if="preview" class="space-y-4 border-t border-border pt-6">
      <div class="grid gap-3 sm:grid-cols-5">
        <div
          v-for="item in [
            [t('import.markdown.summary.create'), preview.summary.creates],
            [t('import.markdown.summary.update'), preview.summary.updates],
            [t('import.markdown.summary.skip'), preview.summary.skips],
            [t('import.markdown.summary.errors'), preview.summary.errors],
            [t('import.markdown.summary.warnings'), preview.summary.warnings],
          ]"
          :key="item[0]"
          class="border border-border p-3"
        >
          <p class="text-2xs uppercase tracking-[0.18em] text-muted-foreground">
            {{ item[0] }}
          </p>
          <p class="mt-2 text-xl font-serif text-foreground">{{ item[1] }}</p>
        </div>
      </div>

      <p
        v-if="!preview.canApply"
        class="border-l border-red-500/60 py-1 pl-4 text-sm text-muted-foreground"
      >
        {{ t("import.markdown.resolveErrors") }}
      </p>

      <section
        v-if="preview.fieldSuggestions.length"
        class="border-y border-border/70 py-4"
        :aria-label="t('import.markdown.suggestedFieldsAria')"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h4 class="m-0 text-sm font-medium text-foreground">
              {{ t("import.markdown.addSuggestedFields") }}
            </h4>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ t("import.markdown.addSuggestedFieldsDescription") }}
            </p>
          </div>
          <span class="text-xs tabular-nums text-muted-foreground">
            {{ selectedSuggestedFields.length }} selected
          </span>
        </div>
        <div class="mt-3 divide-y divide-border/70 border-y border-border/70">
          <div
            v-for="field in preview.fieldSuggestions"
            :key="field.key"
            class="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left"
          >
            <Checkbox
              :model-value="isSuggestedFieldSelected(field.key)"
              :aria-label="`Add ${field.label} to the collection`"
              @update:model-value="toggleSuggestedField(field)"
            />
            <button
              type="button"
              class="min-w-0 text-left"
              @click="toggleSuggestedField(field)"
            >
              <span class="block text-sm font-medium text-foreground">
                {{ field.label }}
              </span>
              <span class="mt-0.5 block truncate text-xs text-muted-foreground">
                {{ field.key }} · {{ field.sourcePaths.length }} source{{
                  field.sourcePaths.length === 1 ? "" : "s"
                }}
              </span>
            </button>
            <Select
              :model-value="selectedSuggestedFieldType(field)"
              :disabled="!isSuggestedFieldSelected(field.key)"
              @update:model-value="updateSuggestedFieldType(field, $event)"
            >
              <SelectTrigger
                class="w-40"
                :aria-label="`Schema type for ${field.label}`"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="type in field.allowedTypes"
                  :key="type"
                  :value="type"
                >
                  {{ suggestedFieldTypeLabel(type) }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
