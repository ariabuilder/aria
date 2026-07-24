<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed, ref, useSlots, watch } from "vue";

import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import VariableReferencePicker from "./VariableReferencePicker.vue";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";
import { useVariableReferenceOptions } from "../../../composables/useVariableReferenceOptions";
import { useStudioI18n } from "@/i18n";
import {
  createVariableReferenceValue,
  extractVariableReferenceKey,
  type VariableReferenceOption,
} from "../../../lib/variableReferences";

interface Props {
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  inputClass?: HTMLAttributes["class"];
  endActionsPaddingClass?: HTMLAttributes["class"];
  contentClass?: HTMLAttributes["class"];
  options?: readonly VariableReferenceOption[];
  pickerPlaceholder?: string;
  variableBeforeEndActions?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: "",
  placeholder: "",
  disabled: false,
  inputClass: undefined,
  endActionsPaddingClass: undefined,
  contentClass: undefined,
  options: undefined,
  pickerPlaceholder: "",
  variableBeforeEndActions: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
  commit: [value: string];
}>();

const isOpen = ref(false);
const lastDirectValue = ref("");
const slots = useSlots();
const { t } = useStudioI18n();

const { variableReferenceOptions, isLoadingVariableReferences } =
  useVariableReferenceOptions();

const currentValue = computed(() => String(props.modelValue ?? ""));

const resolvedOptions = computed<readonly VariableReferenceOption[]>(
  () => props.options ?? variableReferenceOptions.value,
);

const variableKey = computed(() =>
  extractVariableReferenceKey(currentValue.value),
);

const selectedOption = computed(
  () =>
    resolvedOptions.value.find(
      (option) => option.value === variableKey.value,
    ) ?? null,
);

const isVariableAssigned = computed(() => variableKey.value !== null);

const hasEndActions = computed(() => Boolean(slots["end-actions"]));
const hasCustomControl = computed(() => Boolean(slots.control));

const resolvedInputPaddingClass = computed(() => {
  if (hasCustomControl.value || !hasEndActions.value) {
    return "pr-9";
  }

  return props.endActionsPaddingClass ?? "pr-[4.25rem]";
});

const buttonTitle = computed(() =>
  selectedOption.value
    ? t("variablePicker.assigned", { variable: selectedOption.value.label })
    : t("variablePicker.assign"),
);

watch(
  currentValue,
  (nextValue) => {
    if (extractVariableReferenceKey(nextValue) === null) {
      lastDirectValue.value = nextValue;
    }
  },
  { immediate: true },
);

function updateModelValue(nextValue: string): void {
  emit("update:modelValue", nextValue);
}

function commitValue(nextValue: string = currentValue.value): void {
  emit("commit", nextValue);
}

function handleInputUpdate(nextValue: string | number): void {
  updateModelValue(String(nextValue));
}

function handleVariableUpdate(nextValue: string | null): void {
  if (!nextValue) {
    updateModelValue(lastDirectValue.value);
    commitValue(lastDirectValue.value);
    isOpen.value = false;
    return;
  }

  if (variableKey.value === null) {
    lastDirectValue.value = currentValue.value;
  }

  const resolvedValue = createVariableReferenceValue(nextValue);
  updateModelValue(resolvedValue);
  commitValue(resolvedValue);
  isOpen.value = false;
}
</script>

<template>
  <div class="group relative" :data-state="isOpen ? 'open' : 'closed'">
    <div
      v-if="hasCustomControl"
      :class="
        cn(
          'relative w-full min-w-0 rounded-sm border border-border/50 border-solid bg-sidebar/40',
          resolvedInputPaddingClass,
          disabled && 'pointer-events-none opacity-50',
        )
      "
    >
      <slot name="control" />
    </div>
    <Input
      v-else
      :model-value="currentValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :class="
        cn(
          props.inputClass,
          isVariableAssigned &&
            'border-primary/50 text-foreground selection:bg-primary/20',
          resolvedInputPaddingClass,
        )
      "
      @update:model-value="handleInputUpdate"
      @blur="commitValue()"
      @keydown.enter.prevent="commitValue()"
    />

    <div
      class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-px"
    >
      <div
        :class="variableBeforeEndActions ? 'order-2' : 'order-1'"
        class="flex items-center"
      >
        <slot name="end-actions" />
      </div>

      <div
        :class="variableBeforeEndActions ? 'order-1' : 'order-2'"
        class="flex shrink-0 items-center"
      >
        <Popover v-model:open="isOpen">
        <PopoverTrigger as-child>
          <button
            type="button"
            :title="buttonTitle"
            :disabled="disabled"
            :class="
              cn(
                'flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground',
                isVariableAssigned && 'text-primary hover:text-primary',
                disabled && 'pointer-events-none opacity-50',
              )
            "
          >
            <span :class="[studioIcons.variable, 'size-4 shrink-0']" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          :side-offset="14"
          :class="cn('w-58 overflow-hidden rounded-md p-0', props.contentClass)"
        >
          <VariableReferencePicker
            :model-value="currentValue"
            :options="resolvedOptions"
            :is-loading="isLoadingVariableReferences"
            :picker-placeholder="pickerPlaceholder || t('variablePicker.search')"
            @select="handleVariableUpdate"
          />
        </PopoverContent>
      </Popover>
      </div>
    </div>
  </div>
</template>
