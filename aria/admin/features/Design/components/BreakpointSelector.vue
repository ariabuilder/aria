<script setup lang="ts">
import { computed } from "vue";
import { useStudioI18n } from "@/i18n";

interface BreakpointOption {
  id: string;
  label: string;
  icon?: string;
}

const { t } = useStudioI18n();

const props = defineProps<{
  modelValue: string;
  breakpoints: BreakpointOption[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const selectedLabel = computed(
  () =>
    props.breakpoints.find((bp) => bp.id === props.modelValue)?.label ??
    props.modelValue,
);

const TOGGLE_CLASS =
  "flex h-9 items-center justify-center overflow-hidden border border-transparent! rounded-sm bg-sidebar/50 px-4 text-xs font-semibold text-muted-foreground transition-colors hover:border-border hover:bg-sidebar hover:text-foreground duration-150";
const ACTIVE_TOGGLE_CLASS =
  "border-primary border border-dashed bg-sidebar! text-primary-foreground shadow-[inset_0_0_0_1px_rgb(var(--color-primary)/0.18)]";
</script>

<template>
  <div
    class="inline-flex flex-wrap items-center gap-1.5"
    role="group"
    :aria-label="t('design.breakpoints.selector.label')"
  >
    <button
      v-for="bp in breakpoints"
      :key="bp.id"
      type="button"
      :class="[TOGGLE_CLASS, bp.id === modelValue && ACTIVE_TOGGLE_CLASS]"
      :aria-label="t('design.breakpoints.selector.editCssAt', { breakpoint: bp.label })"
      :aria-pressed="bp.id === modelValue"
      @click="emit('update:modelValue', bp.id)"
    >
      <span v-if="bp.icon" :class="[bp.icon, 'mr-2 size-3.5 shrink-0']" />
      <span>{{ bp.label }}</span>
    </button>
  </div>
</template>
