<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePropsEditor } from "../composables/usePropsEditor";
import {
  INSPECTOR_PROPERTY_LABEL_CLASS,
  INSPECTOR_PROPERTY_ROW_CLASS,
  INSPECTOR_SELECT_CONTENT_CLASS,
  INSPECTOR_SELECT_TRIGGER_CLASS,
} from "../constants/panelTokens";
import { useStudioI18n } from "@/i18n";

interface Props {
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const propsEditor = usePropsEditor();
const { t } = useStudioI18n();

async function handleArchiveFilterModeChange(value: string): Promise<void> {
  if (value === "none") {
    await propsEditor.setCmsListArchiveFilterMode("none");
    return;
  }
  if (value === "relation" || value === "reference") {
    await propsEditor.setCmsListArchiveFilterMode(value);
  }
}

async function handleArchiveFilterFieldChange(value: string): Promise<void> {
  await propsEditor.setCmsListArchiveFilterField(value);
}
</script>

<template>
  <template
    v-if="
      propsEditor.isEntryTemplatePage.value &&
      propsEditor.cmsArchiveBridgingFields.value.length > 0
    "
  >
    <div :class="INSPECTOR_PROPERTY_ROW_CLASS">
      <label :class="INSPECTOR_PROPERTY_LABEL_CLASS">{{ t("inspector.archiveFilter.label") }}</label>
      <Select
        :model-value="propsEditor.cmsListArchiveFilterEffectiveMode.value"
        :disabled="props.disabled"
        @update:model-value="
          (value) => void handleArchiveFilterModeChange(String(value))
        "
      >
        <SelectTrigger :class="INSPECTOR_SELECT_TRIGGER_CLASS">
          <SelectValue :placeholder="t('inspector.archiveFilter.filter')" />
        </SelectTrigger>
        <SelectContent :class="INSPECTOR_SELECT_CONTENT_CLASS">
          <SelectItem value="none">{{ t("inspector.archiveFilter.none") }}</SelectItem>
          <SelectItem
            v-if="propsEditor.cmsListArchiveRelationFields.value.length > 0"
            value="relation"
          >
            {{ t("inspector.archiveFilter.tagged") }}
          </SelectItem>
          <SelectItem
            v-if="propsEditor.cmsListArchiveReferenceFields.value.length > 0"
            value="reference"
          >
            {{ t("inspector.archiveFilter.referenced") }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div
      v-if="propsEditor.cmsListArchiveFilterShowFieldPicker.value"
      :class="INSPECTOR_PROPERTY_ROW_CLASS"
    >
      <label :class="INSPECTOR_PROPERTY_LABEL_CLASS">{{ t("inspector.archiveFilter.field") }}</label>
      <Select
        :model-value="propsEditor.cmsListArchiveFilterField.value"
        :disabled="props.disabled"
        @update:model-value="
          (value) => void handleArchiveFilterFieldChange(String(value))
        "
      >
        <SelectTrigger :class="INSPECTOR_SELECT_TRIGGER_CLASS">
          <SelectValue :placeholder="t('inspector.props.chooseField')" />
        </SelectTrigger>
        <SelectContent :class="INSPECTOR_SELECT_CONTENT_CLASS">
          <SelectItem
            v-for="field in propsEditor.cmsListArchiveFilterEffectiveMode
              .value === 'relation'
              ? propsEditor.cmsListArchiveRelationFields.value
              : propsEditor.cmsListArchiveReferenceFields.value"
            :key="field.key"
            :value="field.key"
          >
            {{ field.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </template>
</template>
