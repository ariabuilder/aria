<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DeleteConfirmDialog,
  PageHeader,
} from "@/features/Studio/core/components";
import { useDialogState } from "@/features/Studio/core/composables";
import { studioIcons } from "@/lib/icons";
import {
  AriaCollectionSchema,
  CollectionSchemaInputSchema,
  UpdateCollectionRequestSchema,
  type AriaCollection,
  type EntryFieldOrderItem,
  type EntryFieldWidth,
  type FieldSchema,
  type SystemEntryFieldKey,
} from "../../../../lib/cms/schemas";
import { normalizeEntryFieldOrderForCollection } from "../../../../lib/cms/entryFieldOrder";
import {
  entryFieldsForCollection,
  isCoverImageField,
} from "../../../../lib/cms/systemFields";
import {
  getEntryFieldPlacement,
  type CmsEntryFieldPlacement,
} from "../lib/entryFieldPlacement";
import {
  getEntryFieldWidthFraction,
  normalizeEntryFieldWidth,
} from "../lib/entryFieldWidth";
import { handleActionResultForbidden } from "@/lib/actionErrors";
import { useStudioI18n } from "@/i18n";
import { useCmsCapabilities } from "../composables/useCmsCapabilities";
import { useCollectionsList } from "../composables/useCollectionsList";
import AddSchemaFieldDialog from "../dialogs/AddSchemaFieldDialog.vue";
import EditSchemaFieldDialog from "../dialogs/EditSchemaFieldDialog.vue";
import { removeSchemaField, replaceSchemaField } from "../lib/schemaFieldForm";

const draggable = defineAsyncComponent(() => import("vuedraggable"));

const props = defineProps<{
  collection: AriaCollection;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  updated: [collection: AriaCollection];
}>();

type SchemaOrderRow =
  | {
      id: string;
      kind: "system";
      key: SystemEntryFieldKey;
      label: string;
      typeLabel: string;
    }
  | {
      id: string;
      kind: "field";
      key: string;
      field: FieldSchema;
      placement: CmsEntryFieldPlacement;
      managed: boolean;
      width: EntryFieldWidth;
    };

const { canUpdateCollection, getForbiddenMessage } = useCmsCapabilities();
const { t } = useStudioI18n();
const {
  collections,
  isLoading: isLoadingCollections,
  loadError: collectionLoadError,
  loadCollections,
} = useCollectionsList();
const isSaving = ref(false);
const isAddFieldDialogOpen = ref(false);
const editingField = ref<FieldSchema | null>(null);
const deleteFieldDialog = useDialogState();
const fieldToDelete = ref<FieldSchema | null>(null);
const mainRows = ref<SchemaOrderRow[]>([]);
const sidebarRows = ref<SchemaOrderRow[]>([]);

const fields = computed(() => props.collection.schema.fields);
const layoutAreas = computed(() => [
  {
    key: "main" as const,
    title: t("collections.schema.mainArea"),
    description: t("collections.schema.mainAreaDescription"),
    empty: t("collections.schema.mainAreaEmpty"),
    rows: mainRows.value,
  },
  {
    key: "sidebar" as const,
    title: t("collections.schema.sidebarArea"),
    description: t("collections.schema.sidebarAreaDescription"),
    empty: t("collections.schema.sidebarAreaEmpty"),
    rows: sidebarRows.value,
  },
]);
const isEditFieldDialogOpen = computed({
  get: () => editingField.value !== null,
  set: (value) => {
    if (!value) {
      editingField.value = null;
    }
  },
});
const editingFieldWidth = computed<EntryFieldWidth>(() => {
  const fieldKey = editingField.value?.key;
  if (!fieldKey) return "full";
  const row = [...mainRows.value, ...sidebarRows.value].find(
    (candidate) => candidate.kind === "field" && candidate.key === fieldKey,
  );
  return row?.kind === "field" ? row.width : "full";
});
function getFieldTypeLabel(field: FieldSchema): string {
  const keyByType: Record<FieldSchema["type"], string> = {
    string: "string", text: "longText", slug: "slug", number: "number",
    integer: "integer", boolean: "boolean", date: "date", datetime: "datetime",
    select: "select", multiSelect: "multiSelect", color: "color", icon: "icon",
    image: "image", file: "file", reference: "reference", relation: "relation",
    link: "link", structuredText: "structuredText", richtext: "richtext",
    json: "json", object: "object", repeater: "repeater",
  };
  return t(`collections.fieldType.${keyByType[field.type]}`);
}

function systemFieldLabel(key: SystemEntryFieldKey): string {
  switch (key) {
    case "title":
      return t("collections.schema.systemTitle");
    case "slug":
      return t("collections.schema.systemSlug");
    case "body":
      return t("collections.schema.systemBody");
  }
}

function systemFieldTypeLabel(key: SystemEntryFieldKey): string {
  switch (key) {
    case "title":
      return t("collections.schema.system");
    case "slug":
      return t("collections.schema.systemSlug");
    case "body":
      return t("collections.schema.systemBody");
  }
}

function rowOrderKey(rowsToKey: readonly SchemaOrderRow[]): string {
  return rowsToKey.map((row) => row.id).join("\u001f");
}

function schemaRowFromOrderItem(
  item: EntryFieldOrderItem,
  fieldsByKey: ReadonlyMap<string, FieldSchema>,
  managedFieldKeys: ReadonlySet<string>,
): SchemaOrderRow | null {
  if (item.kind === "system") {
    return {
      id: `system:${item.key}`,
      kind: "system",
      key: item.key,
      label: systemFieldLabel(item.key),
      typeLabel: systemFieldTypeLabel(item.key),
    };
  }

  const field = fieldsByKey.get(item.key);
  if (!field) {
    return null;
  }

  return {
    id: `field:${field.key}`,
    kind: "field",
    key: field.key,
    field,
    placement: item.placement ?? getEntryFieldPlacement(field),
    managed: managedFieldKeys.has(field.key),
    width: normalizeEntryFieldWidth(item.width),
  };
}

function schemaRowsForCollection(collection: AriaCollection): {
  main: SchemaOrderRow[];
  sidebar: SchemaOrderRow[];
} {
  const entryFields = entryFieldsForCollection(collection);
  const fieldsByKey = new Map(entryFields.map((field) => [field.key, field]));
  const hasPersistedCover = collection.schema.fields.some(isCoverImageField);
  const managedFieldKeys = new Set(
    collection.supports.includes("cover") && !hasPersistedCover
      ? ["cover"]
      : [],
  );
  const rows = normalizeEntryFieldOrderForCollection(collection)
    .map((item) => schemaRowFromOrderItem(item, fieldsByKey, managedFieldKeys))
    .filter((row): row is SchemaOrderRow => Boolean(row));

  return {
    main: rows.filter(
      (row) => row.kind === "system" || row.placement === "main",
    ),
    sidebar: rows.filter(
      (row) => row.kind === "field" && row.placement === "sidebar",
    ),
  };
}

function syncLocalFields(): void {
  const layout = schemaRowsForCollection(props.collection);
  mainRows.value = layout.main;
  sidebarRows.value = layout.sidebar;
}

function openAddFieldDialog(): void {
  isAddFieldDialogOpen.value = true;
  void loadCollections();
}

function fieldsFromRows(rows: readonly SchemaOrderRow[]): FieldSchema[] {
  return rows
    .filter(
      (row): row is Extract<SchemaOrderRow, { kind: "field" }> =>
        row.kind === "field" && !row.managed,
    )
    .map((row) => row.field);
}

function entryFieldOrderFromRows(
  rows: readonly SchemaOrderRow[],
): EntryFieldOrderItem[] {
  return rows.map((row) =>
    row.kind === "system"
      ? { kind: "system", key: row.key }
      : {
          kind: "field",
          key: row.key,
          placement: row.placement,
          ...(row.width === "full" ? {} : { width: row.width }),
        },
  );
}

async function saveRows(
  nextMainRows: readonly SchemaOrderRow[],
  nextSidebarRows: readonly SchemaOrderRow[],
): Promise<boolean> {
  if (!canUpdateCollection.value) {
    toast.error(getForbiddenMessage("cms.collections.update"));
    return false;
  }

  const nextRows = [...nextMainRows, ...nextSidebarRows];
  const nextFields = fieldsFromRows(nextRows);
  const entryFieldOrder = entryFieldOrderFromRows(nextRows);
  const parsedSchema = CollectionSchemaInputSchema.parse({
    ...props.collection.schema,
    fields: [...nextFields],
    entryFieldOrder,
  });

  const payload = UpdateCollectionRequestSchema.parse({
    id: props.collection.id,
    expectedUpdatedAt: props.collection.updatedAt,
    patch: {
      fields: parsedSchema.fields,
      entryFieldOrder: parsedSchema.entryFieldOrder,
    },
  });

  isSaving.value = true;
  try {
    const { data, error } = await actions.cms.collections.update(payload);
    if (error) {
      if (handleActionResultForbidden({ error }, "cms.collections.update")) {
        return false;
      }
      toast.error(error.message ?? "Failed to update schema");
      return false;
    }

    const collection = AriaCollectionSchema.parse(data);
    emit("updated", collection);
      toast.success(t("collections.schema.updated"));
    return true;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to update schema");
    return false;
  } finally {
    isSaving.value = false;
  }
}

async function addField(
  field: FieldSchema,
  width: EntryFieldWidth = "full",
): Promise<void> {
  const nextRows = [...mainRows.value];
  const newRow: SchemaOrderRow = {
    id: `field:${field.key}`,
    kind: "field",
    key: field.key,
    field,
    placement: "main",
    managed: false,
    width,
  };
  const lastRow = nextRows[nextRows.length - 1];
  const trailingBodyIndex =
    lastRow?.kind === "system" && lastRow.key === "body"
      ? nextRows.length - 1
      : -1;
  let lastCustomIndex = -1;
  for (let index = nextRows.length - 1; index >= 0; index -= 1) {
    if (nextRows[index]?.kind === "field") {
      lastCustomIndex = index;
      break;
    }
  }
  const insertIndex =
    trailingBodyIndex >= 0
      ? trailingBodyIndex
      : lastCustomIndex >= 0
        ? lastCustomIndex + 1
        : nextRows.length;

  nextRows.splice(insertIndex, 0, newRow);
  const ok = await saveRows(nextRows, sidebarRows.value);
  if (ok) {
    isAddFieldDialogOpen.value = false;
  }
}

function requestDeleteField(field: FieldSchema): void {
  fieldToDelete.value = field;
  deleteFieldDialog.open();
}

function handleDeleteFieldDialogOpenChange(open: boolean): void {
  if (open) {
    deleteFieldDialog.open();
    return;
  }

  deleteFieldDialog.close();
  if (!isSaving.value) {
    fieldToDelete.value = null;
  }
}

async function confirmDeleteField(): Promise<void> {
  const field = fieldToDelete.value;
  if (!field || isSaving.value) {
    return;
  }

  await deleteField(field.key);
  deleteFieldDialog.close();
  fieldToDelete.value = null;
}

async function deleteField(fieldKey: string): Promise<void> {
  const currentRows = [...mainRows.value, ...sidebarRows.value];
  const nextFields = removeSchemaField(fieldsFromRows(currentRows), fieldKey);
  const fieldsByKey = new Map(nextFields.map((field) => [field.key, field]));
  const cleanRows = (rows: readonly SchemaOrderRow[]) => rows
    .filter((row) => row.kind === "system" || row.key !== fieldKey)
    .map((row): SchemaOrderRow | null => {
      if (row.kind === "system") {
        return row;
      }
      const field = fieldsByKey.get(row.key);
      return field ? { ...row, field } : null;
    })
    .filter((row): row is SchemaOrderRow => Boolean(row));
  const ok = await saveRows(cleanRows(mainRows.value), cleanRows(sidebarRows.value));
  if (!ok) {
    syncLocalFields();
  }
}

function openEditField(field: FieldSchema): void {
  editingField.value = field;
  void loadCollections();
}

function openEditFieldFromCard(event: MouseEvent, field: FieldSchema): void {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.closest("button,a,input,select,textarea")
  ) {
    return;
  }

  openEditField(field);
}

async function updateField(
  field: FieldSchema,
  width: EntryFieldWidth,
): Promise<void> {
  const currentRows = [...mainRows.value, ...sidebarRows.value];
  const nextFields = replaceSchemaField(fieldsFromRows(currentRows), field);
  const fieldsByKey = new Map(nextFields.map((item) => [item.key, item]));
  const updateRows = (rows: readonly SchemaOrderRow[]) => rows.map((row): SchemaOrderRow => {
    if (row.kind === "system") {
      return row;
    }
    return {
      ...row,
      field: fieldsByKey.get(row.key) ?? row.field,
      ...(row.key === field.key ? { width } : {}),
    };
  });
  const ok = await saveRows(updateRows(mainRows.value), updateRows(sidebarRows.value));
  if (ok) {
    editingField.value = null;
  } else {
    syncLocalFields();
  }
}

async function reorderFields(): Promise<void> {
  if (isSaving.value || !canUpdateCollection.value) {
    syncLocalFields();
    return;
  }

  const persisted = schemaRowsForCollection(props.collection);
  if (
    rowOrderKey(mainRows.value) === rowOrderKey(persisted.main) &&
    rowOrderKey(sidebarRows.value) === rowOrderKey(persisted.sidebar)
  ) {
    return;
  }

  mainRows.value = mainRows.value.map((row) =>
    row.kind === "field" ? { ...row, placement: "main" } : row,
  );
  sidebarRows.value = sidebarRows.value.map((row) =>
    row.kind === "field" ? { ...row, placement: "sidebar" } : row,
  );
  const ok = await saveRows(mainRows.value, sidebarRows.value);
  if (!ok) {
    syncLocalFields();
  }
}

function canMoveField(event: {
  draggedContext?: { element?: SchemaOrderRow };
  to?: HTMLElement;
}): boolean {
  const row = event.draggedContext?.element;
  if (row?.kind !== "system") {
    return true;
  }

  return event.to?.dataset.layoutArea === "main";
}

watch(
  () => props.collection,
  () => {
    syncLocalFields();
  },
  { immediate: true },
);
</script>

<template>
  <div :class="embedded ? 'grid gap-5 pb-6' : 'h-full overflow-auto'">
    <PageHeader
      v-if="!embedded"
      :title="t('collections.schema.title')"
      :description="t('collections.schema.description', { count: fields.length, collection: collection.name })"
      entity-label-singular="field"
      :hide-create="true"
      :hide-search="true"
    >
      <template #actions>
        <Button
          size="md"
          :disabled="isSaving || !canUpdateCollection"
          :title="
            canUpdateCollection
              ? t('collections.schema.addField')
              : getForbiddenMessage('cms.collections.update')
          "
          @click="openAddFieldDialog"
        >
          {{ t("collections.schema.addField") }}
        </Button>
      </template>
    </PageHeader>

    <div
      v-else
      class="flex min-w-0 items-center justify-between gap-4 mb-3"
    >
      <div class="min-w-0">
        <h2 class="m-0 text-lg font-medium text-foreground">{{ t("collections.schema.title") }}</h2>
        <p class="m-0 mt-1 text-sm text-muted-foreground">
          {{ t("collections.schema.description", { count: fields.length, collection: collection.name }) }}
        </p>
      </div>
      <Button
        size="md"
        class="shrink-0"
        :disabled="isSaving || !canUpdateCollection"
        :title="
          canUpdateCollection
            ? t('collections.schema.addField')
            : getForbiddenMessage('cms.collections.update')
        "
        @click="openAddFieldDialog"
      >
        {{ t("collections.schema.addField") }}
      </Button>
    </div>

    <div
      :class="
        embedded
          ? 'grid gap-6'
          : 'grid gap-8 px-7 py-5 max-w-4xl'
      "
    >
      <section class="grid content-start gap-5">
        <p class="m-0 text-xs leading-5 text-muted-foreground">
          {{ t("collections.schema.layoutHint") }}
        </p>

        <div v-for="area in layoutAreas" :key="area.key" class="grid gap-2">
          <div class="flex items-end justify-between gap-3 px-0.5">
            <div class="min-w-0">
              <h3 class="m-0 text-sm font-medium text-foreground">
                {{ area.title }}
              </h3>
              <p class="m-0 mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {{ area.description }}
              </p>
            </div>
            <Badge variant="outline" size="xs" class="shrink-0">
              {{ area.rows.length }}
            </Badge>
          </div>

          <draggable
            :list="area.rows"
            item-key="id"
            :animation="150"
            :group="{ name: 'entry-layout' }"
            :move="canMoveField"
            handle=".schema-field-drag-handle"
            :disabled="isSaving || !canUpdateCollection"
            :data-layout-area="area.key"
            class="grid min-h-14 content-start gap-2 rounded-lg border border-dashed border-border/60 bg-card/15 p-2"
            @end="reorderFields"
          >
            <template #item="{ element: row }">
              <div
                class="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border border-border/50 bg-background px-1.5 py-1.5 shadow-xs transition-colors hover:border-border"
                :class="row.kind === 'system' ? 'bg-muted/20' : ''"
                @dblclick="
                  row.kind === 'field' &&
                  !row.managed &&
                  openEditFieldFromCard($event, row.field)
                "
              >
                <button
                  type="button"
                  class="schema-field-drag-handle grid size-7 shrink-0 cursor-grab place-items-center rounded-sm text-muted-foreground/40 transition-colors hover:bg-card hover:text-muted-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
                  :disabled="isSaving || !canUpdateCollection"
                  :aria-label="t('collections.schema.reorder')"
                >
                  <span :class="[studioIcons.dragHandle, 'size-3.5']" />
                </button>

                <p class="m-0 min-w-0 truncate text-xs font-medium text-foreground">
                  {{ row.kind === "system" ? row.label : row.field.label }}
                </p>

                <div class="flex items-center gap-0.5">
                  <div
                    v-if="row.kind === 'field' && !row.managed"
                    class="schema-row-switcher"
                  >
                    <span
                      class="schema-row-overlay schema-row-type-toggle truncate text-[10px] text-muted-foreground/70"
                    >
                      {{ getFieldTypeLabel(row.field) }}
                    </span>
                    <div
                      class="schema-row-overlay schema-row-actions flex items-center gap-0.5"
                    >
                      <Badge
                        v-if="area.key === 'main'"
                        variant="outline"
                        size="xs"
                        class="mr-1 h-5 shrink-0 px-1.5 text-[9px] text-muted-foreground"
                      >
                        {{ getEntryFieldWidthFraction(row.width) }}
                      </Badge>
                      <Button
                        variant="sidebar-action"
                        size="icon-sm"
                        :disabled="isSaving || !canUpdateCollection"
                        :title="t('collections.schema.edit')"
                        :aria-label="t('collections.schema.edit')"
                        @click="openEditField(row.field)"
                      >
                        <span :class="[studioIcons.edit, 'size-3.5']" />
                      </Button>
                      <Button
                        variant="sidebar-action"
                        size="icon-sm"
                        :disabled="isSaving || !canUpdateCollection"
                        :title="t('collections.schema.remove')"
                        :aria-label="t('collections.schema.remove')"
                        @click="requestDeleteField(row.field)"
                      >
                        <span :class="[studioIcons.trash, 'size-3.5']" />
                      </Button>
                    </div>
                  </div>

                  <template
                    v-else-if="row.kind === 'field' && area.key === 'main'"
                  >
                    <div class="schema-row-switcher">
                      <span
                        class="schema-row-overlay schema-row-type-toggle truncate text-[10px] text-muted-foreground/70"
                      >
                        {{ getFieldTypeLabel(row.field) }}
                      </span>
                      <Badge
                        variant="outline"
                        size="xs"
                        class="schema-row-overlay schema-row-actions h-5 shrink-0 px-1.5 text-[9px] text-muted-foreground"
                      >
                        {{ getEntryFieldWidthFraction(row.width) }}
                      </Badge>
                    </div>
                    <span
                      :class="[studioIcons.lock, 'mx-2 size-3.5 text-muted-foreground/40']"
                      :title="t('collections.schema.managedField')"
                    />
                  </template>

                  <template v-else>
                    <span
                      class="truncate text-[10px] text-muted-foreground/70"
                    >
                      {{
                        row.kind === "system"
                          ? row.typeLabel
                          : getFieldTypeLabel(row.field)
                      }}
                    </span>
                    <span
                      :class="[studioIcons.lock, 'mx-2 size-3.5 text-muted-foreground/40']"
                      :title="
                        row.kind === 'field'
                          ? t('collections.schema.managedField')
                          : t('collections.schema.systemMainOnly')
                      "
                    />
                  </template>
                </div>
              </div>
            </template>

            <template #footer>
              <div
                v-if="area.rows.length === 0"
                class="grid min-h-10 place-items-center px-3 text-center text-[11px] leading-4 text-muted-foreground/65"
              >
                {{ area.empty }}
              </div>
            </template>
          </draggable>
        </div>

        <Button
          v-if="fields.length === 0"
          variant="outline"
          size="sm"
          :disabled="isSaving || !canUpdateCollection"
          @click="openAddFieldDialog"
        >
          <span :class="[studioIcons.add, 'size-3.5 shrink-0']" />
          {{ t("collections.schema.emptyTitle") }}
        </Button>
      </section>
    </div>

    <AddSchemaFieldDialog
      :open="isAddFieldDialogOpen"
      :existing-fields="fields"
      :disabled="!canUpdateCollection"
      :is-saving="isSaving"
      :forbidden-message="getForbiddenMessage('cms.collections.update')"
      :collections="collections"
      :is-loading-collections="isLoadingCollections"
      :collection-load-error="collectionLoadError"
      @update:open="isAddFieldDialogOpen = $event"
      @add="addField"
    />
    <EditSchemaFieldDialog
      :open="isEditFieldDialogOpen"
      :field="editingField"
      :disabled="!canUpdateCollection"
      :is-saving="isSaving"
      :forbidden-message="getForbiddenMessage('cms.collections.update')"
      :collections="collections"
      :is-loading-collections="isLoadingCollections"
      :collection-load-error="collectionLoadError"
      :entry-width="editingFieldWidth"
      @update:open="isEditFieldDialogOpen = $event"
      @save="updateField"
    />
    <DeleteConfirmDialog
      :open="deleteFieldDialog.isOpen.value"
      :title="t('collections.schema.removeTitle')"
      :description="t('collections.schema.removeDescription')"
      :item-name="fieldToDelete?.label"
      :is-loading="isSaving"
      :confirm-label="t('collections.schema.remove')"
      @update:open="handleDeleteFieldDialogOpenChange"
      @confirm="confirmDeleteField"
    />
  </div>
</template>

<style scoped>
.schema-row-switcher {
  display: grid;
  align-items: center;
  justify-items: end;
}

.schema-row-overlay {
  grid-area: 1 / 1;
}

.schema-row-type-toggle {
  opacity: 1;
  transition:
    opacity 90ms ease-out,
    transform 140ms ease-out;
}

.schema-row-actions {
  pointer-events: none;
  opacity: 0;
  transform: translateX(0.5rem);
  transition:
    opacity 120ms ease-out,
    transform 180ms cubic-bezier(0.22, 1.45, 0.36, 1);
}

.group:hover .schema-row-actions,
.group:focus-within .schema-row-actions {
  pointer-events: auto;
  opacity: 1;
  transform: translateX(0);
}

.group:hover .schema-row-type-toggle,
.group:focus-within .schema-row-type-toggle {
  opacity: 0;
  transform: translateX(-0.25rem);
}

@media (hover: none) {
  .schema-row-actions {
    pointer-events: auto;
    opacity: 1;
    transform: translateX(0);
  }

  .schema-row-type-toggle {
    opacity: 0;
    transform: translateX(-0.25rem);
  }
}
</style>
