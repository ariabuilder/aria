<script setup lang="ts">
import {
  INSPECTOR_SELECT_CONTENT_CLASS,
  INSPECTOR_SELECT_TRIGGER_CLASS,
} from "../../../constants/panelTokens";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MotionPropertyRow from "./MotionPropertyRow.vue";

interface Option {
  id: string;
  label: string;
}

interface Props {
  label: string;
  modelValue?: string;
  options: Option[];
  placeholder?: string;
}

withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  placeholder: "Select",
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<template>
  <MotionPropertyRow :label="label">
    <Select
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event as string)"
    >
      <SelectTrigger :class="INSPECTOR_SELECT_TRIGGER_CLASS">
        <SelectValue :placeholder="placeholder" />
      </SelectTrigger>
      <SelectContent :class="INSPECTOR_SELECT_CONTENT_CLASS">
        <SelectItem
          v-for="option in options"
          :key="option.id"
          :value="option.id"
        >
          {{ option.label }}
        </SelectItem>
      </SelectContent>
    </Select>
  </MotionPropertyRow>
</template>
