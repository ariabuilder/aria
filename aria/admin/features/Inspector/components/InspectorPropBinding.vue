<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import CmsBindingPicker from "@/features/CMS/components/CmsBindingPicker.vue";
import CmsFieldCommandSelect from "@/features/CMS/components/CmsFieldCommandSelect.vue";
import { studioIcons } from "@/lib/icons";
import type { BindingPickerMode } from "../composables/useInspectorPropBinding";
import type { CmsBindingFieldOptionGroup } from "../composables/usePropsEditor";
import { useStudioI18n } from "@/i18n";

const { t } = useStudioI18n();

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    groups: readonly CmsBindingFieldOptionGroup[];
    displayLabel?: string;
    disabled?: boolean;
    placeholder?: string;
    showClear?: boolean;
    variant?: "default" | "toolbar" | "inline";
    active?: boolean;
    pickerMode?: BindingPickerMode;
  }>(),
  {
    modelValue: "",
    displayLabel: "",
    disabled: false,
    placeholder: "",
    showClear: true,
    variant: "default",
    active: false,
    pickerMode: "fast-fields",
  },
);

const emit = defineEmits<{
  select: [path: string];
  clear: [];
}>();

const canClear = computed(
  () => props.showClear && Boolean(props.modelValue?.trim()),
);

const usesMultiStepPicker = computed(() => props.pickerMode === "multi-step");

function handleSelect(fieldOrPath: { path: string } | string) {
  const path = typeof fieldOrPath === "string" ? fieldOrPath : fieldOrPath.path;
  emit("select", path);
}

function handleClear() {
  emit("clear");
}
</script>

<template>
  <div
    class="grid min-w-0 items-center gap-1"
    :class="
      variant === 'inline'
        ? 'flex-1 grid-cols-[minmax(0,1fr)_auto]'
        : 'w-full grid-cols-[minmax(0,1fr)_auto]'
    "
  >
    <CmsBindingPicker
      v-if="usesMultiStepPicker"
      class="min-w-0"
      :model-value="modelValue"
      :groups="groups"
      :disabled="disabled"
      :placeholder="placeholder || t('inspector.props.chooseField')"
      :display-label="displayLabel"
      :active="active || Boolean(modelValue)"
      @select="handleSelect"
      @clear="handleClear"
    />
    <CmsFieldCommandSelect
      v-else
      class="min-w-0"
      :model-value="modelValue"
      :groups="groups"
      :disabled="disabled || groups.length === 0"
      :placeholder="placeholder || t('inspector.props.chooseField')"
      :display-label="displayLabel"
      :variant="variant === 'toolbar' ? 'toolbar' : 'default'"
      :active="active || Boolean(modelValue)"
      @select="handleSelect"
      @clear="handleClear"
    />
    <Button
      v-if="canClear && variant !== 'toolbar'"
      type="button"
      variant="ghost"
      size="icon"
      class="h-8! w-8! shrink-0"
      :aria-label="t('inspector.binding.clear')"
      @pointerdown.stop.prevent="handleClear"
      @click.stop.prevent="handleClear"
    >
      <span :class="[studioIcons.close, 'size-3']" />
    </Button>
  </div>
</template>
