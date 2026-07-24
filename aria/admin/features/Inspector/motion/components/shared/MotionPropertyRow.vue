<script setup lang="ts">
import { INSPECTOR_PROPERTY_LABEL_CLASS } from "../../../constants/panelTokens";

interface Props {
  label: string;
}

defineProps<Props>();
</script>

<template>
  <div class="grid grid-cols-[minmax(9.5rem,auto)_minmax(0,1fr)] items-center gap-2">
    <span :class="[INSPECTOR_PROPERTY_LABEL_CLASS, 'leading-tight']">{{ label }}</span>
    <div class="min-w-0">
      <slot />
    </div>
  </div>
</template>
