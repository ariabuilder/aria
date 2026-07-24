<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useStudioI18n } from "@/i18n";

defineProps<{
  colors: readonly string[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  select: [value: string];
}>();
const { t } = useStudioI18n();
</script>

<template>
  <div
    v-if="colors.length > 0"
    :class="['min-w-0 overflow-hidden px-2 py-1']"
  >
    <div
      class="flex w-full gap-1"
      role="list"
      :aria-label="t('colorPicker.recentColors')"
    >
      <Button
        v-for="color in colors"
        :key="color"
        type="button"
        role="listitem"
        variant="color-swatch"
        size="icon-xs"
        class="h-6! min-w-0! flex-1! rounded-sm!"
        :style="{ backgroundColor: color }"
        :title="color"
        :disabled="disabled"
        @click="emit('select', color)"
      />
    </div>
  </div>
</template>
