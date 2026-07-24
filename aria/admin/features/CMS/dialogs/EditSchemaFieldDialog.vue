<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { studioIcons } from "@/lib/icons";
import type {
  EntryFieldWidth,
  FieldSchema,
} from "../../../../lib/cms/schemas";
import AddSchemaFieldDialog from "./AddSchemaFieldDialog.vue";
import { useStudioI18n } from "@/i18n";
import CmsCollectionCommandSelect from "../components/CmsCollectionCommandSelect.vue";
import CmsFieldWidthSelector from "../components/CmsFieldWidthSelector.vue";
import { normalizeEntryFieldWidth } from "../lib/entryFieldWidth";
import type { CollectionSummary } from "../composables/useCollectionsList";
import {
  buildUpdatedSchemaFieldFromDraft,
  createEmptySchemaFieldDraft,
  createSchemaFieldDraftFromField,
  fieldSupportsNestedSchema,
  removeSchemaField,
  reorderNestedSchemaFields,
  type CmsSchemaFieldDraft,
  type CmsSchemaFieldErrors,
} from "../lib/schemaFieldForm";

const draggable = defineAsyncComponent(() => import("vuedraggable"));

const props = defineProps<{
  open: boolean;
  field: FieldSchema | null;
  disabled: boolean;
  isSaving: boolean;
  forbiddenMessage: string;
  collections: readonly CollectionSummary[];
  isLoadingCollections?: boolean;
  collectionLoadError?: string | null;
  entryWidth?: EntryFieldWidth;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  save: [field: FieldSchema, width: EntryFieldWidth];
}>();
const { t } = useStudioI18n();

function localizedFieldTypeLabel(type: string): string {
  const keyByType: Record<string, string> = {
    string: "string", text: "longText", slug: "slug", number: "number", integer: "integer", boolean: "boolean", date: "date", datetime: "datetime", select: "select", multiSelect: "multiSelect", color: "color", icon: "icon", image: "image", file: "file", reference: "reference", relation: "relation", link: "link", structuredText: "structuredText", richtext: "richtext", json: "json", object: "object", repeater: "repeater",
  };
  return t(`collections.fieldType.${keyByType[type] ?? type}`);
}

function localizedError(error: string | undefined): string {
  if (!error) return "";
  if (error === "Label is required") return t("collections.field.error.labelRequired");
  if (error === "Field key cannot be changed yet") return t("collections.field.error.keyLocked");
  if (error === "Field type cannot be changed yet") return t("collections.field.error.typeLocked");
  if (error === "Add at least one option") return t("collections.field.error.optionsRequired");
  if (error === "Target collection is required") return t("collections.field.error.targetRequired");
  if (error === "Choose a nested field for the row title") return t("collections.field.error.titleFieldRequired");
  return error;
}

const draft = ref<CmsSchemaFieldDraft>(createEmptySchemaFieldDraft());
const errors = ref<CmsSchemaFieldErrors>({});
const nestedFields = ref<FieldSchema[]>([]);
const isAddNestedFieldDialogOpen = ref(false);
const entryWidthDraft = ref<EntryFieldWidth>("full");

const fieldTypeLabel = computed(() => {
  const type = props.field?.type;
  return type ? localizedFieldTypeLabel(type) : "";
});
const showOptions = computed(
  () => draft.value.type === "select" || draft.value.type === "multiSelect",
);
const showTargetCollection = computed(
  () => draft.value.type === "reference" || draft.value.type === "relation",
);
const showNestedFields = computed(
  () => props.field !== null && fieldSupportsNestedSchema(props.field),
);
const showRepeaterDisplay = computed(() => props.field?.type === "repeater");

watch(
  () => [props.open, props.field] as const,
  ([open, field]) => {
    errors.value = {};
    draft.value = open && field
      ? createSchemaFieldDraftFromField(field)
      : createEmptySchemaFieldDraft();
    nestedFields.value = open && field && fieldSupportsNestedSchema(field)
      ? [...(field.fields ?? [])]
      : [];
    isAddNestedFieldDialogOpen.value = false;
    entryWidthDraft.value = normalizeEntryFieldWidth(props.entryWidth);
  },
  { immediate: true },
);

function handleOpenChange(open: boolean): void {
  emit("update:open", open);
}

function submitField(): void {
  if (props.disabled || props.isSaving || !props.field) {
    return;
  }
  errors.value = {};
  const result = buildUpdatedSchemaFieldFromDraft(
    props.field,
    draft.value,
    showNestedFields.value ? nestedFields.value : undefined,
  );
  if (!result.success) {
    errors.value = result.errors;
    return;
  }
  emit(
    "save",
    showNestedFields.value
      ? reorderNestedSchemaFields(result.field, nestedFields.value)
      : result.field,
    entryWidthDraft.value,
  );
}

function addNestedField(field: FieldSchema): void {
  nestedFields.value = [...nestedFields.value, field];
  isAddNestedFieldDialogOpen.value = false;
}

function removeNestedField(fieldKey: string): void {
  nestedFields.value = removeSchemaField(nestedFields.value, fieldKey);
  if (draft.value.repeaterTitleFieldKey === fieldKey) {
    draft.value = {
      ...draft.value,
      repeaterTitleFieldKey: "",
    };
  }
}

function handleDialogPointerDownOutside(
  event: CustomEvent<{ originalEvent: PointerEvent }>,
): void {
  const target = event.detail.originalEvent.target;
  if (
    target instanceof HTMLElement &&
    target.closest("[data-cms-collection-picker-content]")
  ) {
    event.preventDefault();
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="sm:max-w-[525px]"
      @pointer-down-outside="handleDialogPointerDownOutside"
    >
      <DialogHeader class="gap-0">
        <DialogTitle>{{ t("collections.field.editTitle") }}</DialogTitle>
        <DialogDescription>
          {{ t("collections.field.editDescription") }}
        </DialogDescription>
      </DialogHeader>

      <div v-if="field" class="grid gap-3">
        <div class="grid gap-2">
          <Label for="edit-schema-field-label" class="text-sm! text-muted-foreground">{{ t("collections.field.label") }}</Label>
          <Input
            id="edit-schema-field-label"
            v-model="draft.label"
            :disabled="isSaving || disabled"
            :aria-invalid="errors.label ? 'true' : undefined"
            @keydown.enter="submitField"
          />
          <p v-if="errors.label" class="text-xs text-destructive">
            {{ localizedError(errors.label) }}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="grid gap-2">
            <Label for="edit-schema-field-key" class="text-sm! text-muted-foreground">{{ t("collections.field.key") }}</Label>
            <Input
              id="edit-schema-field-key"
              v-model="draft.key"
              disabled
              :aria-invalid="errors.key ? 'true' : undefined"
            />
            <p v-if="errors.key" class="text-xs text-destructive">
              {{ localizedError(errors.key) }}
            </p>
          </div>
          <div class="grid gap-2">
            <Label for="edit-schema-field-type" class="text-sm! text-muted-foreground">{{ t("collections.field.type") }}</Label>
            <Input
              id="edit-schema-field-type"
              :model-value="fieldTypeLabel"
              disabled
              :aria-invalid="errors.type ? 'true' : undefined"
            />
            <p v-if="errors.type" class="text-xs text-destructive">
              {{ localizedError(errors.type) }}
            </p>
          </div>
        </div>

        <CmsFieldWidthSelector
          v-model="entryWidthDraft"
          :disabled="isSaving || disabled"
        />

        <div v-if="showOptions" class="grid gap-2">
          <Label for="edit-schema-field-options">{{ t("collections.field.options") }}</Label>
          <Textarea
            id="edit-schema-field-options"
            v-model="draft.optionsText"
            rows="4"
            :disabled="isSaving || disabled"
            :aria-invalid="errors.optionsText ? 'true' : undefined"
          />
          <p v-if="errors.optionsText" class="text-xs text-destructive">
            {{ localizedError(errors.optionsText) }}
          </p>
        </div>

        <div v-if="showTargetCollection" class="grid gap-2">
          <Label for="edit-schema-field-target-collection">
            {{ t("collections.field.targetCollection") }}
          </Label>
          <CmsCollectionCommandSelect
            id="edit-schema-field-target-collection"
            v-model="draft.targetCollection"
            :collections="collections"
            :disabled="isSaving || disabled"
            :is-loading="isLoadingCollections"
            :load-error="collectionLoadError"
            :aria-invalid="errors.targetCollection ? 'true' : undefined"
          />
          <p v-if="errors.targetCollection" class="text-xs text-destructive">
            {{ localizedError(errors.targetCollection) }}
          </p>
        </div>

        <label class="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <Checkbox v-model="draft.required" :disabled="isSaving || disabled" />
          {{ t("collections.field.required") }}
        </label>

        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            v-model="draft.searchable"
            :disabled="isSaving || disabled"
          />
          {{ t("collections.field.searchable") }}
        </label>

        <label class="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            v-model="draft.showInEntryList"
            :disabled="isSaving || disabled"
          />
          {{ t("collections.field.showInTable") }}
        </label>

        <div
          v-if="showNestedFields"
          class="grid gap-3 rounded-md border border-border/50 bg-card/30 p-3"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="grid gap-0.5">
              <p class="m-0 text-sm font-medium leading-none text-foreground">
                {{ t("collections.field.nested") }}
              </p>
              <p class="m-0 text-xs text-muted-foreground">
                {{ t("collections.field.nestedCount", { count: nestedFields.length, type: localizedFieldTypeLabel(draft.type) }) }}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="isSaving || disabled"
              @click="isAddNestedFieldDialogOpen = true"
            >
              {{ t("collections.schema.addField") }}
            </Button>
          </div>

          <div
            v-if="nestedFields.length === 0"
            class="rounded-md border border-dashed border-border/50 px-3 py-4 text-xs text-muted-foreground"
          >
            {{ t("collections.field.addChild") }}
          </div>

          <draggable
            v-model="nestedFields"
            item-key="key"
            :animation="150"
            handle=".nested-schema-field-drag-handle"
            :disabled="isSaving || disabled"
            class="grid gap-2"
          >
            <template #item="{ element: nestedField }">
              <div
                class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/50 bg-background/60 px-2.5 py-2"
              >
                <button
                  type="button"
                  class="nested-schema-field-drag-handle grid size-7 place-items-center rounded-sm text-muted-foreground/40 transition-colors hover:bg-card hover:text-muted-foreground disabled:cursor-default disabled:opacity-40"
                  :class="
                    !disabled && !isSaving
                      ? 'cursor-grab active:cursor-grabbing'
                      : ''
                  "
                  :disabled="isSaving || disabled"
                  :aria-label="t('collections.field.reorderNested')"
                >
                  <span :class="[studioIcons.dragHandle, 'size-3.5']" />
                </button>
                <div class="min-w-0">
                  <p class="m-0 truncate text-sm font-medium leading-tight text-foreground">
                    {{ nestedField.label }}
                  </p>
                  <p class="m-0 truncate text-xs text-muted-foreground">
                    {{ nestedField.key }} · {{ nestedField.type }}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="isSaving || disabled"
                  @click="removeNestedField(nestedField.key)"
                >
                  {{ t("collections.field.remove") }}
                </Button>
              </div>
            </template>
          </draggable>

          <div
            v-if="showRepeaterDisplay"
            class="grid gap-3 border-t border-dashed border-border/50 pt-3"
          >
            <div class="grid gap-2">
              <Label for="edit-schema-field-repeater-title">
                {{ t("collections.field.collapsedTitle") }}
              </Label>
              <Select
                :model-value="draft.repeaterTitleFieldKey || '__auto'"
                :disabled="isSaving || disabled"
                @update:model-value="
                  (value) => {
                    draft.repeaterTitleFieldKey =
                      value === '__auto' ? '' : String(value);
                  }
                "
              >
                <SelectTrigger id="edit-schema-field-repeater-title">
                  <SelectValue :placeholder="t('collections.field.autoTitle')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto">{{ t("collections.field.autoTitle") }}</SelectItem>
                  <SelectItem
                    v-for="nestedField in nestedFields"
                    :key="nestedField.key"
                    :value="nestedField.key"
                  >
                    {{ nestedField.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p
                v-if="errors.repeaterTitleFieldKey"
                class="text-xs text-destructive"
              >
                {{ localizedError(errors.repeaterTitleFieldKey) }}
              </p>
            </div>

            <div class="grid gap-2">
              <Label for="edit-schema-field-repeater-add-label">
                {{ t("collections.field.addButtonLabel") }}
              </Label>
              <Input
                id="edit-schema-field-repeater-add-label"
                v-model="draft.repeaterAddButtonLabel"
                :placeholder="t('collections.field.addPlaceholder')"
                :disabled="isSaving || disabled"
              />
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          class="h-9!"
          :disabled="isSaving"
          @click="handleOpenChange(false)"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          size="sm"
          class="h-9!"
          :disabled="isSaving || disabled || !field"
          :title="disabled ? forbiddenMessage : t('collections.field.save')"
          @click="submitField"
        >
          {{ isSaving ? t("common.saving") : t("collections.field.save") }}
        </Button>
      </DialogFooter>

      <AddSchemaFieldDialog
        :open="isAddNestedFieldDialogOpen"
        :existing-fields="nestedFields"
        :disabled="disabled"
        :is-saving="isSaving"
        :forbidden-message="forbiddenMessage"
        :collections="collections"
        :is-loading-collections="isLoadingCollections"
        :collection-load-error="collectionLoadError"
        :show-entry-width="false"
        @update:open="isAddNestedFieldDialogOpen = $event"
        @add="addNestedField"
      />
    </DialogContent>
  </Dialog>
</template>
