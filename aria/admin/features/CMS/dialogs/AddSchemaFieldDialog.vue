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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { studioIcons } from "@/lib/icons";
import type {
  EntryFieldWidth,
  FieldSchema,
} from "../../../../lib/cms/schemas";
import CmsCollectionCommandSelect from "../components/CmsCollectionCommandSelect.vue";
import CmsFieldWidthSelector from "../components/CmsFieldWidthSelector.vue";
import { useStudioI18n } from "@/i18n";
import type { CollectionSummary } from "../composables/useCollectionsList";
import {
  buildSchemaFieldFromDraft,
  CMS_SCHEMA_FIELD_TYPE_GROUPS,
  createEmptySchemaFieldDraft,
  normalizeSchemaFieldKey,
  removeSchemaField,
  type CmsSchemaFieldDraft,
  type CmsSchemaFieldErrors,
} from "../lib/schemaFieldForm";

const draggable = defineAsyncComponent(() => import("vuedraggable"));

const props = defineProps<{
  open: boolean;
  existingFields: readonly FieldSchema[];
  disabled: boolean;
  isSaving: boolean;
  forbiddenMessage: string;
  collections: readonly CollectionSummary[];
  isLoadingCollections?: boolean;
  collectionLoadError?: string | null;
  showEntryWidth?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  add: [field: FieldSchema, width: EntryFieldWidth];
}>();
const { t } = useStudioI18n();

function fieldTypeLabel(type: string): string {
  const keyByType: Record<string, string> = {
    string: "string", text: "longText", slug: "slug", number: "number", integer: "integer", boolean: "boolean", date: "date", datetime: "datetime", select: "select", multiSelect: "multiSelect", color: "color", icon: "icon", image: "image", file: "file", reference: "reference", relation: "relation", link: "link", structuredText: "structuredText", richtext: "richtext", json: "json", object: "object", repeater: "repeater",
  };
  return t(`collections.fieldType.${keyByType[type] ?? type}`);
}

function fieldTypeGroupLabel(label: string): string {
  const keyByLabel: Record<string, string> = { Text: "text", "Numbers & dates": "numbers", Choices: "choices", Design: "design", Media: "media", References: "references", Advanced: "advanced" };
  return t(`collections.fieldType.${keyByLabel[label] ?? label}`);
}

function localizedError(error: string | undefined): string {
  if (!error) return "";
  if (error === "Label is required") return t("collections.field.error.labelRequired");
  if (error === "Field key is required") return t("collections.field.error.keyRequired");
  if (error === "Add at least one option") return t("collections.field.error.optionsRequired");
  if (error === "Target collection is required") return t("collections.field.error.targetRequired");
  if (error === "Add at least one nested field") return t("collections.field.error.nestedRequired");
  if (error === "Choose a nested field for the row title") return t("collections.field.error.titleFieldRequired");
  const match = /^Field \"(.+)\" already exists$/.exec(error);
  return match ? t("collections.field.error.keyExists", { key: match[1] }) : error;
}

const draft = ref<CmsSchemaFieldDraft>(createEmptySchemaFieldDraft());
const errors = ref<CmsSchemaFieldErrors>({});
const isKeyEdited = ref(false);
const nestedFields = ref<FieldSchema[]>([]);
const isAddNestedFieldDialogOpen = ref(false);
const entryWidth = ref<EntryFieldWidth>("full");

const showOptions = computed(
  () => draft.value.type === "select" || draft.value.type === "multiSelect",
);
const showTargetCollection = computed(
  () => draft.value.type === "reference" || draft.value.type === "relation",
);
const showNestedFields = computed(
  () => draft.value.type === "object" || draft.value.type === "repeater",
);
const showRepeaterDisplay = computed(() => draft.value.type === "repeater");

watch(
  () => draft.value.label,
  (label) => {
    if (isKeyEdited.value) return;
    draft.value = {
      ...draft.value,
      key: normalizeSchemaFieldKey(label),
    };
  },
);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      resetForm();
    }
  },
);

function resetForm(): void {
  draft.value = createEmptySchemaFieldDraft();
  errors.value = {};
  isKeyEdited.value = false;
  nestedFields.value = [];
  isAddNestedFieldDialogOpen.value = false;
  entryWidth.value = "full";
}

function handleOpenChange(open: boolean): void {
  if (!open) {
    resetForm();
  }
  emit("update:open", open);
}

function submitField(): void {
  if (props.disabled || props.isSaving) {
    return;
  }
  errors.value = {};
  const result = buildSchemaFieldFromDraft(
    draft.value,
    props.existingFields,
    showNestedFields.value ? nestedFields.value : [],
  );
  if (!result.success) {
    errors.value = result.errors;
    return;
  }
  emit("add", result.field, entryWidth.value);
}

function addNestedField(field: FieldSchema): void {
  nestedFields.value = [...nestedFields.value, field];
  isAddNestedFieldDialogOpen.value = false;
  const { fields: _fields, ...rest } = errors.value;
  errors.value = rest;
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

function handleKeyInput(): void {
  isKeyEdited.value = true;
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
        <DialogTitle>{{ t("collections.field.addTitle") }}</DialogTitle>
        <DialogDescription>
          {{ t("collections.field.addDescription") }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-3">
        <div class="grid gap-2">
          <Label for="schema-field-label">{{ t("collections.field.label") }}</Label>
          <Input
            id="schema-field-label"
            v-model="draft.label"
            :disabled="isSaving || disabled"
            :aria-invalid="errors.label ? 'true' : undefined"
            @keydown.enter="submitField"
          />
          <p v-if="errors.label" class="text-xs text-destructive">
            {{ localizedError(errors.label) }}
          </p>
        </div>

        <div class="grid gap-2">
          <Label for="schema-field-key">{{ t("collections.field.key") }}</Label>
          <Input
            id="schema-field-key"
            v-model="draft.key"
            :disabled="isSaving || disabled"
            :aria-invalid="errors.key ? 'true' : undefined"
            @input="handleKeyInput"
            @keydown.enter="submitField"
          />
          <p v-if="errors.key" class="text-xs text-destructive">
            {{ localizedError(errors.key) }}
          </p>
        </div>

        <div class="grid gap-2">
          <Label for="schema-field-type">{{ t("collections.field.type") }}</Label>
          <Select v-model="draft.type" :disabled="isSaving || disabled">
            <SelectTrigger id="schema-field-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent class="max-h-80 min-w-60 max-w-[calc(100vw-2rem)]">
              <template
                v-for="(group, groupIndex) in CMS_SCHEMA_FIELD_TYPE_GROUPS"
                :key="group.label"
              >
                <SelectSeparator v-if="groupIndex > 0" />
                <SelectGroup>
                  <SelectLabel
                    class="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-primary/80"
                  >
                    {{ fieldTypeGroupLabel(group.label) }}
                  </SelectLabel>
                  <SelectItem
                    v-for="option in group.options"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ fieldTypeLabel(option.value) }}
                  </SelectItem>
                </SelectGroup>
              </template>
            </SelectContent>
          </Select>
        </div>

        <CmsFieldWidthSelector
          v-if="showEntryWidth !== false"
          v-model="entryWidth"
          :disabled="isSaving || disabled"
        />

        <div v-if="showOptions" class="grid gap-2">
          <Label for="schema-field-options">{{ t("collections.field.options") }}</Label>
          <Textarea
            id="schema-field-options"
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
          <Label for="schema-field-target-collection">{{ t("collections.field.targetCollection") }}</Label>
          <CmsCollectionCommandSelect
            id="schema-field-target-collection"
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
                {{ t("collections.field.nestedCount", { count: nestedFields.length, type: fieldTypeLabel(draft.type) }) }}
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

          <p v-if="errors.fields" class="text-xs text-destructive">
            {{ localizedError(errors.fields) }}
          </p>

          <div
            v-if="showRepeaterDisplay"
            class="grid gap-3 border-t border-dashed border-border/50 pt-3"
          >
            <div class="grid gap-2">
              <Label for="schema-field-repeater-title">
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
                <SelectTrigger id="schema-field-repeater-title">
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
              <Label for="schema-field-repeater-add-label">
                {{ t("collections.field.addButtonLabel") }}
              </Label>
              <Input
                id="schema-field-repeater-add-label"
                v-model="draft.repeaterAddButtonLabel"
                :placeholder="t('collections.field.addPlaceholder')"
                :disabled="isSaving || disabled"
              />
            </div>
          </div>
        </div>

        <label class="flex items-center gap-2 text-xs text-muted-foreground">
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

        <label class="flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox
            v-model="draft.showInEntryList"
            class="mt-0.5"
            :disabled="isSaving || disabled"
          />
          <span class="grid gap-0.5">
            <span class="text-foreground/85">{{ t("collections.field.showInList") }}</span>
            <span>{{ t("collections.field.showInListDescription") }}</span>
          </span>
        </label>
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
          :disabled="isSaving || disabled"
          :title="disabled ? forbiddenMessage : t('collections.schema.addField')"
          @click="submitField"
        >
          {{ isSaving ? t("collections.field.adding") : t("collections.schema.addField") }}
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
