<script setup lang="ts">
import { computed } from "vue";
import { colord } from "colord";

import {
  colorInputPlaceholder,
  formatColorInput,
} from "@/features/Design/lib/colorFormat";
import { extractCssVariableReferenceKey } from "@/features/Design/lib/colorPickerValue";
import ColorPicker from "./ColorPicker.vue";
import { CHECKERBOARD_STYLE } from "./checkerboard";
import { COLOR_FIELD_TRIGGER_CLASS } from "./panel.tokens";
import type { ColorFieldVariant, ColorPickerProps } from "./types";

const props = withDefaults(
  defineProps<
    ColorPickerProps & {
      label?: string;
      variant?: ColorFieldVariant;
    }
  >(),
  {
    resolvedModelValue: null,
    contrastAgainst: null,
    resolvedContrastAgainst: null,
    showAlpha: true,
    disabled: false,
    readOnly: false,
    placeholder: undefined,
    showDesignColors: false,
    showVariables: undefined,
    layout: "unified",
    persistMode: "commit",
    contentClass: undefined,
    contentSide: "bottom",
    contentAlign: "start",
    contentSideOffset: 8,
    contentAlignOffset: 0,
    label: undefined,
    variant: "inspector",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  preview: [value: string];
  commit: [value: string];
}>();

const isToolbar = computed(() => props.variant === "toolbar");
const effectiveLayout = computed(() => props.layout);
const effectiveShowDesignColors = computed(
  () => props.showDesignColors,
);
const effectiveShowVariables = computed(() =>
  isToolbar.value ? false : props.showVariables,
);

const displayValue = computed(() => {
  const trimmed = props.modelValue.trim();
  if (!trimmed || props.readOnly) {
    return props.placeholder ?? "—";
  }

  if (extractCssVariableReferenceKey(trimmed) !== null) {
    return trimmed;
  }

  const parsed = colord(trimmed);
  if (!parsed.isValid()) {
    return trimmed;
  }

  return formatColorInput(parsed, "hex", { showAlpha: props.showAlpha });
});
</script>

<template>
  <div
    :class="
      label
        ? 'grid grid-cols-[72px_1fr] items-center gap-2'
        : 'contents'
    "
  >
    <span
      v-if="label"
      class="text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
    >
      {{ label }}
    </span>

    <ColorPicker
      :model-value="modelValue"
      :resolved-model-value="resolvedModelValue"
      :contrast-against="contrastAgainst"
      :resolved-contrast-against="resolvedContrastAgainst"
      :show-alpha="showAlpha"
      :disabled="disabled"
      :read-only="readOnly"
      :placeholder="placeholder"
      :show-design-colors="effectiveShowDesignColors"
      :show-variables="effectiveShowVariables"
      :layout="effectiveLayout"
      :persist-mode="persistMode"
      :content-class="contentClass"
      :content-side="contentSide"
      :content-align="contentAlign"
      :content-side-offset="contentSideOffset"
      :content-align-offset="contentAlignOffset"
      @update:model-value="emit('update:modelValue', $event)"
      @preview="emit('preview', $event)"
      @commit="emit('commit', $event)"
    >
      <template #default="{ previewColor }">
        <button
          v-if="isToolbar"
          type="button"
          class="relative size-5 shrink-0 overflow-hidden rounded-sm border border-border/50 border-solid transition-[color,box-shadow] hover:bg-sidebar/80 hover:border-border/50 cursor-pointer"
          :style="{ background: CHECKERBOARD_STYLE }"
          :disabled="disabled"
          @click.stop
        >
          <span
            class="absolute inset-0 block size-full"
            :style="{ backgroundColor: previewColor || 'transparent' }"
          />
        </button>

        <button
          v-else
          type="button"
          :class="COLOR_FIELD_TRIGGER_CLASS"
          :disabled="disabled"
          @click.stop
        >
          <span
            class="size-5 shrink-0 rounded-sm border border-border/50"
            :style="{ background: CHECKERBOARD_STYLE }"
          >
            <span
              class="block size-full rounded-sm"
              :style="{ backgroundColor: previewColor || 'transparent' }"
            />
          </span>
          <span class="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
            {{ displayValue }}
          </span>
        </button>
      </template>
    </ColorPicker>
  </div>
</template>
