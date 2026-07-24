<script setup lang="ts">
import { computed } from "vue";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import VariableReferencePicker from "./VariableReferencePicker.vue";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import {
  extractVariableReferenceKey,
  type VariableReferenceOption,
} from "@/lib/variableReferences";

interface Props {
  modelValue?: string;
  disabled?: boolean;
  options: readonly VariableReferenceOption[];
  pickerPlaceholder?: string;
  buttonClass?: string;
  popoverAlign?: "start" | "center" | "end";
  sideOffset?: number;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: "",
  disabled: false,
  pickerPlaceholder: "",
  buttonClass: undefined,
  popoverAlign: "end",
  sideOffset: 8,
});

const emit = defineEmits<{
  select: [value: string | null];
}>();

const isOpen = defineModel<boolean>("open", { default: false });
const { t } = useStudioI18n();

const variableKey = computed(() =>
  extractVariableReferenceKey(String(props.modelValue ?? "")),
);

const isVariableAssigned = computed(() => variableKey.value !== null);

const selectedVariableOption = computed(
  () =>
    props.options.find((option) => option.value === variableKey.value) ?? null,
);

const buttonTitle = computed(() =>
  selectedVariableOption.value
    ? t("variablePicker.assigned", {
        variable: selectedVariableOption.value.label,
      })
    : t("variablePicker.assign"),
);

function handleSelect(nextValue: string | null): void {
  emit("select", nextValue);
  isOpen.value = false;
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <button
        type="button"
        :title="buttonTitle"
        :disabled="disabled"
        :class="
          cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-dashed border-border/50 bg-sidebar/40 text-muted-foreground transition-colors hover:bg-sidebar/80 hover:text-foreground',
            isVariableAssigned && 'border-primary/50 text-primary',
            disabled && 'pointer-events-none opacity-50',
            buttonClass,
          )
        "
      >
        <span :class="[studioIcons.variable, 'size-4 shrink-0']" />
      </button>
    </PopoverTrigger>

    <PopoverContent
      :align="popoverAlign"
      :side-offset="sideOffset"
      class="w-58 overflow-hidden rounded-md p-0"
    >
      <VariableReferencePicker
        :model-value="modelValue"
        :options="options"
        :picker-placeholder="pickerPlaceholder || t('variablePicker.search')"
        @select="handleSelect"
      />
    </PopoverContent>
  </Popover>
</template>
