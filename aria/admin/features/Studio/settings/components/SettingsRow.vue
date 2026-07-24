<script setup lang="ts">
import { useId } from "vue";

const props = defineProps<{
  label: string;
  description?: string;
  fullWidth?: boolean;
  inputId?: string;
}>();

const fallbackId = useId();
const resolvedInputId = props.inputId ?? `settings-${fallbackId}`;
const descriptionId = `${resolvedInputId}-description`;
</script>

<template>
  <div
    class="flex select-none"
    :class="
      fullWidth
        ? 'flex-col items-stretch gap-0'
        : 'items-center justify-between gap-6'
    "
  >
    <!-- Label area -->
    <div class="min-w-0" :class="{ 'w-full': fullWidth, 'flex-1': !fullWidth }">
      <label
        :for="resolvedInputId"
        class="block text-sm font-medium text-foreground"
      >
        {{ label }}
      </label>
      <p
        v-if="description || $slots.description"
        :id="descriptionId"
        class="mt-1 text-xs text-muted-foreground"
      >
        <slot name="description">{{ description }}</slot>
      </p>
    </div>

    <!-- Input slot -->
    <div
      class="min-w-0"
      :class="{ 'w-full': fullWidth, 'shrink-0': !fullWidth }"
    >
      <slot />
    </div>
  </div>
</template>
