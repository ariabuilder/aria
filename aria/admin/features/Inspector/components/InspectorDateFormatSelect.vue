<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CMS_DATE_FORMAT_OPTIONS,
  type CmsDateFormatId,
} from "../../../../lib/cms/dateBindingFormats";
import {
  INSPECTOR_PROPERTY_LABEL_CLASS,
  INSPECTOR_PROPERTY_ROW_CLASS,
  INSPECTOR_SELECT_CONTENT_CLASS,
  INSPECTOR_SELECT_TRIGGER_CLASS,
} from "../constants/panelTokens";
import { useStudioI18n } from "@/i18n";

const props = withDefaults(
  defineProps<{
    modelValue: CmsDateFormatId;
    disabled?: boolean;
    showLabel?: boolean;
  }>(),
  {
    disabled: false,
    showLabel: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: CmsDateFormatId];
}>();
const { t } = useStudioI18n();
</script>

<template>
  <div
    :class="showLabel ? INSPECTOR_PROPERTY_ROW_CLASS : 'grid min-w-0 gap-1'"
  >
    <span
      v-if="showLabel"
      :class="INSPECTOR_PROPERTY_LABEL_CLASS"
    >
      {{ t("inspector.dateFormat.format") }}
    </span>
    <Select
      :model-value="props.modelValue"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event as CmsDateFormatId)"
    >
      <SelectTrigger
        class="h-8! w-full min-w-0 text-xs"
        :class="INSPECTOR_SELECT_TRIGGER_CLASS"
        :aria-label="t('inspector.dateFormat.label')"
      >
        <SelectValue :placeholder="t('inspector.dateFormat.choose')" />
      </SelectTrigger>
      <SelectContent
        class="w-42"
        :class="INSPECTOR_SELECT_CONTENT_CLASS"
      >
        <SelectItem
          v-for="option in CMS_DATE_FORMAT_OPTIONS"
          :key="option.id"
          :value="option.id"
        >
          {{ option.example }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
