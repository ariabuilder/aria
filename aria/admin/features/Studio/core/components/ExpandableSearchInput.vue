<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import HeaderActionTooltip from "./HeaderActionTooltip.vue";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    tooltipSide?: "top" | "bottom" | "left" | "right";
    tooltipPortalled?: boolean;
    compact?: boolean;
  }>(),
  {
    modelValue: "",
    placeholder: "Search...",
    tooltipSide: "bottom",
    tooltipPortalled: true,
    compact: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:open": [open: boolean];
}>();
const { t } = useStudioI18n();

const isOpen = ref(false);
const fieldRef = ref<HTMLElement | null>(null);

watch(
  () => props.modelValue,
  (value) => {
    if (value.trim()) {
      isOpen.value = true;
      return;
    }

    const input = fieldRef.value?.querySelector("input");
    if (input instanceof HTMLInputElement && document.activeElement === input) {
      return;
    }

    isOpen.value = false;
  },
  { immediate: true },
);

watch(isOpen, (open) => {
  emit("update:open", open);
});

function focusInput(): void {
  const input = fieldRef.value?.querySelector("input");
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.select();
  }
}

function openSearch(): void {
  isOpen.value = true;
  void nextTick().then(focusInput);
}

function toggleSearch(): void {
  if (isOpen.value) {
    if (!props.modelValue.trim()) {
      isOpen.value = false;
    } else {
      focusInput();
    }
    return;
  }

  openSearch();
}

function handleBlur(): void {
  if (!props.modelValue.trim()) {
    isOpen.value = false;
  }
}

function handleInput(val: string | number) {
  emit("update:modelValue", String(val));
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("update:modelValue", "");
    isOpen.value = false;
  }
}

defineExpose({ open: openSearch, focus: focusInput });
</script>

<template>
  <div class="inline-flex shrink-0 items-center overflow-hidden">
    <HeaderActionTooltip
      :label="t('common.search')"
      :side="props.tooltipSide"
      :portalled="props.tooltipPortalled"
    >
      <Button
        variant="headerAction"
        size="icon-header"
        :aria-expanded="isOpen"
        :aria-label="t('common.search')"
        @click="toggleSearch"
      >
        <span :class="[studioIcons.search, 'size-3.5 shrink-0']" />
      </Button>
    </HeaderActionTooltip>

    <div
      ref="fieldRef"
      :class="[
        'overflow-hidden transition-all duration-200 ease-out',
        isOpen
          ? props.compact
            ? 'ml-1 w-42 opacity-100'
            : 'ml-1.5 w-52 opacity-100'
          : 'ml-0 w-0 opacity-0',
      ]"
    >
      <Input
        :model-value="props.modelValue"
        :placeholder="props.placeholder"
        :tabindex="isOpen ? 0 : -1"
        :class="
          props.compact
            ? 'h-6! rounded-sm border-transparent! bg-input! px-2 text-xs shadow-none hover:border-transparent! hover:bg-input! focus-visible:bg-input! focus-visible:ring-0! focus-active:bg-input!'
            : 'w-full text-xs h-7.5!'
        "
        @update:model-value="handleInput"
        @blur="handleBlur"
        @keydown="handleKeydown"
      />
    </div>
  </div>
</template>
