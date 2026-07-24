<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { studioIcons } from "@/lib/icons";
import type { FieldSchema } from "../../../../lib/cms/schemas";
import { resolveEntryLabels } from "../lib/resolveEntryLabels";
import type { CmsEntryRow } from "../lib/entryRow";
import EntryPickerDialog from "./EntryPickerDialog.vue";
import { useStudioI18n } from "@/i18n";

const props = withDefaults(
  defineProps<{
    field: FieldSchema & { type: "relation" };
    modelValue: readonly string[];
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();
const { t } = useStudioI18n();

const isPickerOpen = ref(false);
const selectedLabels = ref<Record<string, string>>({});

const fieldId = computed(() => `cms-relation-${props.field.key}`);
const selectedIds = computed(() =>
  props.modelValue.filter((value): value is string => typeof value === "string"),
);
const selectedIdsKey = computed(() => selectedIds.value.join("\0"));

async function hydrateSelectedLabels(): Promise<void> {
  const targetCollection = props.field.targetCollection?.trim();
  if (!targetCollection) {
    return;
  }

  const unresolvedIds = selectedIds.value.filter(
    (id) => id && selectedLabels.value[id] === undefined,
  );
  if (unresolvedIds.length === 0) {
    return;
  }

  try {
    const labels = await resolveEntryLabels(targetCollection, unresolvedIds);
    selectedLabels.value = {
      ...selectedLabels.value,
      ...labels,
    };
  } catch {
    // Keep UUID fallback labels if the lookup fails; saving should still work.
  }
}

watch(
  () => [props.field.targetCollection, selectedIdsKey.value],
  () => {
    void hydrateSelectedLabels();
  },
  { immediate: true },
);

function openPicker(): void {
  if (props.disabled || !props.field.targetCollection) return;
  isPickerOpen.value = true;
}

function removeTarget(targetEntryId: string): void {
  emit(
    "update:modelValue",
    selectedIds.value.filter((id) => id !== targetEntryId),
  );
}

function moveTarget(targetEntryId: string, direction: -1 | 1): void {
  const next = [...selectedIds.value];
  const index = next.indexOf(targetEntryId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= next.length) {
    return;
  }
  const [item] = next.splice(index, 1);
  if (!item) return;
  next.splice(targetIndex, 0, item);
  emit("update:modelValue", next);
}

function handleEntrySelect(entry: CmsEntryRow): void {
  selectedLabels.value = {
    ...selectedLabels.value,
    [entry.id]: entry.title || entry.slug,
  };
  if (selectedIds.value.includes(entry.id)) {
    return;
  }
  emit("update:modelValue", [...selectedIds.value, entry.id]);
}
</script>

<template>
  <div class="grid gap-2">
    <div class="flex items-center justify-between gap-3">
      <Label :for="fieldId" class="m-0 text-sm! leading-none text-muted-foreground">
        {{ field.label }}<span v-if="field.required" aria-hidden="true"> *</span>
      </Label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="disabled || !field.targetCollection"
        :title="
          field.targetCollection
            ? t('cms.relation.addEntry')
            : t('cms.relation.targetMissing')
        "
        @click="openPicker"
      >
        {{ t("cms.relation.add") }}
      </Button>
    </div>

    <div
      :id="fieldId"
      class="grid gap-2 rounded-md border border-border bg-card/30 p-2"
    >
      <p
        v-if="selectedIds.length === 0"
        class="px-1 py-2 text-xs text-muted-foreground"
      >
        {{ t("cms.relation.empty") }}
      </p>
      <div
        v-for="(targetEntryId, index) in selectedIds"
        :key="targetEntryId"
        class="flex min-w-0 items-center justify-between gap-2 rounded-sm border border-border/50 bg-card/30 px-2 py-1.5"
      >
        <span class="min-w-0">
          <span class="block truncate text-xs text-foreground">
            {{ selectedLabels[targetEntryId] ?? targetEntryId }}
          </span>
          <span
            v-if="!selectedLabels[targetEntryId]"
            class="block truncate text-[10px] text-muted-foreground"
          >
            {{ targetEntryId }}
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            :disabled="disabled || index === 0"
            @click="moveTarget(targetEntryId, -1)"
          >
            <span :class="[studioIcons.chevronUp, 'size-3.5']" />
          </button>
          <button
            type="button"
            class="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            :disabled="disabled || index === selectedIds.length - 1"
            @click="moveTarget(targetEntryId, 1)"
          >
            <span :class="[studioIcons.chevronDown, 'size-3.5']" />
          </button>
          <button
            type="button"
            class="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
            :disabled="disabled"
            @click="removeTarget(targetEntryId)"
          >
            <span :class="[studioIcons.trash, 'size-3.5']" />
          </button>
        </span>
      </div>
    </div>

    <EntryPickerDialog
      v-if="field.targetCollection"
      v-model:open="isPickerOpen"
      :target-collection="field.targetCollection"
      :title="t('cms.relation.addField', { field: field.label })"
      @select="handleEntrySelect"
    />
  </div>
</template>
