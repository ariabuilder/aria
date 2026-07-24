<script setup lang="ts">
import CmsEntryCommandSelect from "./CmsEntryCommandSelect.vue";
import type { CmsEntryRow } from "../lib/entryRow";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

defineProps<{
  collectionId: string;
  modelValue: string;
  disabled?: boolean;
}>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  select: [entry: CmsEntryRow];
}>();

function handleSelect(entry: CmsEntryRow) {
  emit("update:modelValue", entry.id);
  emit("select", entry);
}
</script>

<template>
  <CmsEntryCommandSelect
    class="min-w-0 max-w-[16rem]"
    variant="sidebar"
    :leading-icon="studioIcons.databaseLine"
    :model-value="modelValue"
    :target-collection="collectionId"
    :disabled="disabled"
    :placeholder="t('cms.previewEntry')"
    @update:model-value="emit('update:modelValue', $event)"
    @select="handleSelect"
  />
</template>
