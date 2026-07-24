<script setup lang="ts">
import { computed } from "vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaTransformVariant } from "../../../../lib/media/transforms/schemas";
import { useStudioI18n } from "@/i18n";

const ORIGINAL_VALUE = "__aria_original__";

const props = defineProps<{
  modelValue: string | null;
  variants: readonly MediaTransformVariant[];
  currentSourceVersion?: number | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
}>();

const { t } = useStudioI18n();
const selectValue = computed(() => props.modelValue ?? ORIGINAL_VALUE);

function variantLabel(variant: MediaTransformVariant): string {
  const width = variant.output.width ?? "—";
  const height = variant.output.height ?? "—";
  const stale =
    props.currentSourceVersion &&
    variant.sourceVersion !== props.currentSourceVersion
      ? ` · ${t("inspector.media.variant.previousSource")}`
      : "";
  return `${variant.name} · ${width} × ${height}${stale}`;
}

function handleChange(value: unknown): void {
  if (typeof value !== "string") return;
  emit("update:modelValue", value === ORIGINAL_VALUE ? null : value);
}
</script>

<template>
  <div class="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
    <label
      class="text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
    >
      {{ t("inspector.media.variant") }}
    </label>
    <Select
      data-testid="media-variant-select"
      :model-value="selectValue"
      :disabled="disabled"
      @update:model-value="handleChange"
    >
      <SelectTrigger
        class="h-9 border-dashed border-border-70 bg-sidebar text-xs hover:border-border hover:bg-sidebar-80 focus:ring-0 focus:ring-offset-0"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        class="border-border-70 bg-sidebar text-foreground shadow-xl"
      >
        <SelectItem :value="ORIGINAL_VALUE">
          {{ t("inspector.media.variant.original") }}
        </SelectItem>
        <SelectItem
          v-for="variant in variants"
          :key="variant.id"
          :value="variant.id"
        >
          {{ variantLabel(variant) }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
